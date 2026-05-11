"""Discovery embedding service — produces and persists vector embeddings.

Foundation for PR 4b's two-stage scoring. This service writes embeddings
to ``discovered_jobs.embedding`` and ``profiles.embedding``; no consumer
reads them yet. PR 4b will use cosine similarity between the two to
rank candidates before spending Anthropic tokens on the top-N.

Stack choices (decided 2026-05-11 in the design pass):

- **fastembed (local ONNX)** — chosen over the OpenAI embeddings API
  because (a) no new vendor / API key / per-call cost, (b) no new error
  surfaces or rate-limit handling. Costs ~250MB of Docker image space.
- **all-MiniLM-L6-v2 (384 dims)** — small enough to load in <1s on a
  modest VPS and produces good general-purpose semantic vectors.
- **pgvector** — vector store lives in the existing Postgres instance.
  No new infra, no separate cluster to maintain.

Where this lives: MJH-local. If MBK later adds an embedding feature,
this service should be promoted to ``platform_shared`` per
``rules/monorepo-parity-discipline.md`` (Tier 1 — security/data primitives
that exist in two apps belong in shared). Don't pre-promote.

Threading model: ``fastembed.TextEmbedding`` keeps a single ONNX runtime
session per instance. We cache one instance at module level (lazy load
on first use) so concurrent requests share it. ONNX is thread-safe for
inference; sharing the singleton is correct.

Failure mode: if model load fails, every public function in this module
raises ``EmbeddingModelLoadError``. Callers (the boot guard, the fetch
service's background task, the profile-update path) MUST decide how to
handle the error — there is NO silent fallback (per
``rules/no-bandaid-solutions.md``). The boot guard re-raises to crash
the lifespan; background tasks log + capture to Sentry; the
profile-update path lets the error bubble (the profile save still
succeeds, only the embedding refresh fails).

PII / untrusted-input: ``description`` text comes from external job
boards and may contain prompt-injection vectors. fastembed runs purely
locally on a fixed model — there is no LLM in the loop here — so
injection content cannot exfiltrate or take action. Embedding it is
safe.

Profile fields embedded: ``skills`` (joined names), ``work_history``
(role titles + bullet excerpts), ``summary``, and the
``parsed_fields.text`` excerpt of the resume when present. Changing
which fields are embedded is a model-shape change — re-embed all
existing profiles after a change.
"""
from __future__ import annotations

import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.discovery.discovered_job import DiscoveredJob
from app.models.profile.profile import Profile
from app.models.profile.skill import Skill
from app.models.profile.work_history import WorkHistory

if TYPE_CHECKING:
    from fastembed import TextEmbedding

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public errors
# ---------------------------------------------------------------------------


class EmbeddingModelLoadError(RuntimeError):
    """Raised when fastembed cannot load the embedding model.

    Surfaces during the boot guard (which then fails the lifespan and
    triggers a deploy rollback) and during runtime embed calls (which
    log to Sentry + bail). Never silently caught — per
    ``rules/no-bandaid-solutions.md`` a missing model is an
    infrastructure bug, not a graceful-degrade scenario.
    """


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------


# Model identifier — see https://qdrant.github.io/fastembed/.
# all-MiniLM-L6-v2 produces 384-dim vectors; if you swap this, also
# update ``_EMBED_DIMS`` in:
#   - alembic/versions/discemb260511_pgvector_embeddings.py
#   - app/models/discovery/discovered_job.py
#   - app/models/profile/profile.py
# and write a follow-up migration to alter the column dim + re-embed
# every row.
_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_EMBED_DIMS = 384

# Description gets truncated before embedding — fastembed's tokenizer
# silently truncates at 512 tokens anyway, and 2000 chars is roughly
# 500 tokens, so we bound input length explicitly to keep encoding
# latency predictable.
_DESCRIPTION_MAX_CHARS = 2000

# Profile resume excerpt cap — same reasoning. Long resumes lose tail
# information regardless of truncation point; 4000 chars covers
# objective + skills + first two roles which is the most match-relevant
# slice.
_PROFILE_TEXT_MAX_CHARS = 4000

# Default batch size for embed_pending_for_user. fastembed processes
# batches via ONNX which amortizes the model load cost — small batches
# work fine. 50 keeps memory use bounded on the VPS.
_DEFAULT_BATCH_SIZE = 50


# ---------------------------------------------------------------------------
# Lazy module-level singleton
# ---------------------------------------------------------------------------


_model: "TextEmbedding | None" = None
_model_lock = threading.Lock()


def _get_model() -> "TextEmbedding":
    """Load the fastembed model lazily, caching it module-globally.

    Thread-safe via a double-checked-lock pattern. The model is
    expensive to load (~1s for all-MiniLM-L6-v2) but cheap to share —
    ONNX runtime is thread-safe for inference.

    Raises:
        EmbeddingModelLoadError: When ``fastembed.TextEmbedding``
            raises during construction. Wrapped to preserve the
            original error message but expose a typed exception
            callers can route on.
    """
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is not None:  # someone else loaded it
            return _model
        try:
            from fastembed import TextEmbedding

            _model = TextEmbedding(model_name=_MODEL_NAME)
            logger.info(
                "discovery_embedding_service: loaded model=%s dims=%d",
                _MODEL_NAME, _EMBED_DIMS,
            )
            return _model
        except Exception as exc:
            # Sentry will pick this up via the caller (boot guard or
            # background task), but log here too so docker logs show
            # the failure even when Sentry is misconfigured.
            logger.exception(
                "discovery_embedding_service: failed to load model %s",
                _MODEL_NAME,
            )
            raise EmbeddingModelLoadError(
                f"failed to load fastembed model {_MODEL_NAME!r}: {exc}"
            ) from exc


def load_model_eager() -> None:
    """Force model load now — called by the boot guard at startup.

    Calling this at lifespan start means an OOM / missing-binary /
    corrupt-cache failure surfaces at boot rather than on the first
    discovery fetch hours later. The lifespan then fails, the
    healthcheck times out, and the deploy rolls back to the previous
    image.

    Raises:
        EmbeddingModelLoadError: Same conditions as ``_get_model``.
    """
    _get_model()


# ---------------------------------------------------------------------------
# Single-text embedding
# ---------------------------------------------------------------------------


def embed_text(text: str) -> list[float]:
    """Embed a single string and return the 384-dim vector.

    Used by tests and by callers that already have the text assembled.
    Use ``embed_posting`` / ``embed_profile`` when you have the ORM
    row — they handle the field-assembly contract.

    Raises:
        EmbeddingModelLoadError: If the model has not loaded.
    """
    model = _get_model()
    # fastembed.embed returns a generator of numpy arrays — materialize
    # the first one. .tolist() converts numpy.float32 → python float for
    # JSON-safe pgvector storage.
    vec = next(iter(model.embed([text or ""])))
    return vec.tolist()


# ---------------------------------------------------------------------------
# Posting / profile text assemblers
# ---------------------------------------------------------------------------


def _assemble_posting_text(posting: DiscoveredJob) -> str:
    """Concatenate the posting fields that determine match relevance.

    Order: title, company_name, description (truncated). Title +
    company are short and high-signal; description carries the body.

    The exact field set defines what embeddings encode — changing it
    invalidates every existing row's embedding. Add fields here only
    if the score quality justifies a re-embed of the entire table.
    """
    title = (posting.title or "").strip()
    company = (posting.company_name or "").strip()
    description = (posting.description or "")[:_DESCRIPTION_MAX_CHARS]
    return f"{title} {company} {description}".strip()


def embed_posting(posting: DiscoveredJob) -> tuple[list[float], str]:
    """Embed a posting and return (vector, model_name).

    Caller is responsible for persisting the result. The two-tuple
    shape (vector + model identifier) lets us store which model
    produced each row so a future model swap can re-embed stale rows
    selectively.
    """
    text = _assemble_posting_text(posting)
    return embed_text(text), _MODEL_NAME


def _assemble_profile_text(
    profile: Profile,
    skills: list[Skill],
    work_history: list[WorkHistory],
) -> str:
    """Concatenate match-relevant profile fields into a single string.

    Fields chosen:
    - ``summary`` — the user's own self-description; high signal when
      present.
    - ``skills.name`` — joined; mirrors how a job description names
      technologies.
    - ``work_history.title`` + bullets[0..2] — recent role titles +
      one or two bullets each capture role focus without exploding
      input length.
    - parsed_fields excerpt — when a resume has been parsed, include
      the top ``_PROFILE_TEXT_MAX_CHARS`` of extracted text as a
      catch-all.

    Fields NOT embedded: name, email, phone, work_auth_status, salary
    prefs — these are filterable / scalar fields, not semantic. Changes
    to them do not affect job matching, so they don't trigger
    re-embeds either.
    """
    parts: list[str] = []
    if profile.summary:
        parts.append(profile.summary.strip())
    if skills:
        parts.append(" ".join(s.name for s in skills if s.name))
    for entry in work_history:
        bits = [entry.title or "", entry.company_name or ""]
        bullets = entry.bullets or []
        if bullets:
            # First 2 bullets — covers role focus without inflating
            # input.
            bits.extend(str(b) for b in bullets[:2])
        parts.append(" ".join(b for b in bits if b))
    parsed = profile.parsed_fields or {}
    parsed_text = parsed.get("text") if isinstance(parsed, dict) else None
    if isinstance(parsed_text, str) and parsed_text.strip():
        parts.append(parsed_text[:_PROFILE_TEXT_MAX_CHARS])
    return " ".join(parts).strip()


async def embed_profile(
    db: AsyncSession, profile: Profile,
) -> tuple[list[float], str]:
    """Embed a profile's match-relevant fields and return (vector, model).

    Loads ``skills`` and ``work_history`` from the DB so the caller
    doesn't have to eager-load them. The returned vector is NOT
    persisted by this function — call ``refresh_profile_embedding``
    for that.
    """
    skills_result = await db.execute(
        select(Skill).where(Skill.user_id == profile.user_id),
    )
    skills = list(skills_result.scalars().all())

    wh_result = await db.execute(
        select(WorkHistory).where(WorkHistory.user_id == profile.user_id),
    )
    work_history = list(wh_result.scalars().all())

    text = _assemble_profile_text(profile, skills, work_history)
    return embed_text(text), _MODEL_NAME


# ---------------------------------------------------------------------------
# Bulk operations called from fetch / profile-update paths
# ---------------------------------------------------------------------------


async def embed_pending_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    batch_size: int = _DEFAULT_BATCH_SIZE,
) -> int:
    """Embed every ``discovered_jobs`` row for ``user_id`` where
    ``embedding IS NULL``.

    Returns the number of rows embedded so the caller can log it.
    Commits in batches so a long fetch with many new postings doesn't
    hold a single huge transaction open.

    Called from ``discovery_fetch_service.fetch_source`` as a
    BackgroundTask after the fetch completes. Failures are logged +
    captured to Sentry; the fetch itself remains successful (per
    ``rules/no-bandaid-solutions.md``, the failure is surfaced loudly
    via logs / Sentry, NOT silently swallowed and NOT cascaded to
    break the fetch).
    """
    total = 0
    while True:
        stmt = (
            select(DiscoveredJob)
            .where(
                DiscoveredJob.user_id == user_id,
                DiscoveredJob.embedding.is_(None),
            )
            .limit(batch_size)
        )
        result = await db.execute(stmt)
        rows = list(result.scalars().all())
        if not rows:
            break
        now = datetime.now(timezone.utc)
        for row in rows:
            vec, model = embed_posting(row)
            row.embedding = vec
            row.embedding_model = model
            row.embedded_at = now
        await db.flush()
        await db.commit()
        total += len(rows)
        if len(rows) < batch_size:
            break

    if total:
        logger.info(
            "discovery_embedding_service: embedded %d postings user=%s",
            total, user_id,
        )
    return total


async def embed_pending_for_user_background(user_id: uuid.UUID) -> None:
    """Background-task entry point — opens its own DB session.

    Mirrors ``discovery_score_service.score_user_inbox`` so the route
    handler can schedule both as ``BackgroundTask``s without juggling
    session ownership across the request lifecycle.

    Errors are logged + propagated to Sentry via the global exception
    handler. NOT silently swallowed — per
    ``rules/no-bandaid-solutions.md`` a failing embed is operationally
    visible.
    """
    try:
        async with AsyncSessionLocal() as db:
            await embed_pending_for_user(db, user_id)
    except Exception:
        # FastAPI's BackgroundTasks does not surface exceptions to the
        # caller; log + re-raise so Sentry (when configured) captures it.
        logger.exception(
            "embed_pending_for_user_background failed user=%s", user_id,
        )
        raise


async def refresh_profile_embedding(
    db: AsyncSession, user_id: uuid.UUID,
) -> bool:
    """Recompute the embedding for ``user_id``'s profile and persist it.

    Returns True when an embedding was written, False when the profile
    row does not exist yet (caller should ensure profile exists first
    via ``profile_service.get_or_create_profile``).

    Call this after any API change that affects ``skills``,
    ``work_history``, ``summary``, or the parsed resume. DO NOT call
    on every minor profile change (e.g. name, phone) — those fields
    are not embedded and re-running fastembed each time wastes a
    ~100ms ONNX inference.
    """
    result = await db.execute(
        select(Profile).where(Profile.user_id == user_id),
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        return False
    vec, model = await embed_profile(db, profile)
    profile.embedding = vec
    profile.embedding_model = model
    profile.embedded_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()
    return True
