"""Job-analysis service — orchestrates the Analyze-a-job pipeline.

Pipeline (one Claude call, two DB reads, one DB write):

1. Resolve the JD source: if the request has only ``url``, fetch +
   extract via the existing :func:`jd_url_extractor.extract_from_url`.
   If it has ``jd_text``, use that verbatim.
2. Load the operator's profile snapshot — Profile, Skill rows, top
   N WorkHistory rows, and Education rows — in a short transaction that
   closes before Claude is called, so no pooled connection waits on it.
   The snapshot is bounded so the prompt stays under Claude's input window.
3. Build the analysis prompt user-content (a JSON-shaped envelope of
   profile + jd_text) and call ``claude_service.call_claude_with_meta``
   so the per-call token / cost meta lands on the JobAnalysis row.
4. Validate the Claude response: every dimension status must be in
   the dimension's enum, the verdict must be one of the four legal
   values, the dimensions array must contain the five expected keys.
5. Persist the JobAnalysis row in a new transaction, commit, return.

Tenant isolation
================
``user_id`` is required on every public function. The repo also
filters by ``user_id`` (defense in depth). The Profile + Skill +
WorkHistory + Education loads all scope by ``user_id`` too.

Cost accounting
================
``call_claude_with_meta`` returns ``input_tokens`` / ``output_tokens``
/ ``cost_usd``. We persist them on the JobAnalysis row so the operator
sees per-analysis cost in the UI, matching the resume-refinement
session pattern.

Module layout
=============
This module owns: ``analyze``, ``score``, ``score_discovered_job``,
``get_analysis``, ``soft_delete_analysis`` and the envelope validation.
Field-level reply normalisation lives in :mod:`analysis_reply_fields`.

Promote logic (creating an Application from a JobAnalysis) lives in the
sibling :mod:`job_analysis_promote_service`. ``apply_to_application`` is
re-exported here for backward compatibility so existing callers
(``app.api.job_analysis``, tests) need no import changes.
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from typing import Any

from platform_shared.core.loggable_url import loggable_url
from platform_shared.core.model_output_log import describe_model_output
from platform_shared.extraction import AnthropicFailureKind, ExtractionError
from platform_shared.repositories.soft_delete import soft_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.job_analysis.job_analysis import JobAnalysis
from app.repositories.discovery import discovery_repository
from app.repositories.job_analysis import job_analysis_repository
from app.services.extraction import claude_service
from app.services.extraction.ai_failure import ai_failure_message
from app.services.extraction.jd_url_extractor import (
    JDAiExtractionError,
    JDFetchAuthRequiredError,
    JDFetchError,
    JDFetchTimeoutError,
    extract_from_url,
)
from app.services.extraction.prompts.job_analysis_prompt import JOB_ANALYSIS_PROMPT
from app.services.job_analysis._job_analysis_utils import _str_or_none
from app.services.job_analysis.analysis_reply_fields import (
    flag_list,
    validate_dimensions,
    validate_extracted,
)
from app.services.job_analysis.extracted_jd_text import join_extracted_text
# Profile-snapshot construction lives in a sibling module (no-growth split).
# Aliased to the prior underscore names so the call sites below are unchanged.
from app.services.job_analysis.profile_snapshot import (
    build_user_content as _build_user_content,
    load_profile_snapshot as _load_profile_snapshot,
)

logger = logging.getLogger(__name__)

# Re-export so callers that import ``apply_to_application`` from this
# module keep working without change (the implementation moved to the
# sibling promote module). The promote module does NOT import from this
# module (it uses _job_analysis_utils directly), so there is no circular
# import.
from app.services.job_analysis.job_analysis_promote_service import (  # noqa: E402
    apply_to_application,
)

__all__ = [
    # Core analyze / score surface
    "analyze",
    "score",
    "score_discovered_job",
    "get_analysis",
    "soft_delete_analysis",
    # Re-exported from promote module for backward compat
    "apply_to_application",
    # Public error types
    "JobAnalysisError",
    "JobAnalysisFetchAuthRequiredError",
    "JobAnalysisFetchTimeoutError",
    "JobAnalysisInvalidUrlError",
]


# ---------------------------------------------------------------------------
# Public errors — route handler maps each to a specific HTTP status.
# ---------------------------------------------------------------------------


class JobAnalysisError(RuntimeError):
    """Generic analysis failure — HTTP 502.

    ``kind`` is the shared Anthropic failure kind when Claude itself failed
    (``None`` for a reply that failed parsing / validation), so the discovery
    score loop and the route route on one classification. ``code`` keeps
    Anthropic's documented ``error.type`` (``rate_limit_error``,
    ``authentication_error``...) for Sentry tags; ``retryable`` is True when
    the next scheduled pass can succeed.
    """

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        retryable: bool = True,
        kind: AnthropicFailureKind | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.kind = kind

    @classmethod
    def from_ai_failure(
        cls, kind: AnthropicFailureKind | None, code: str | None = None,
    ) -> "JobAnalysisError":
        """A Claude failure, with our own copy as the message (never provider text)."""
        return cls(
            ai_failure_message(kind),
            code=code,
            retryable=kind is None or kind.is_transient,
            kind=kind,
        )


class JobAnalysisFetchAuthRequiredError(JobAnalysisError):
    """Source URL was auth-walled or returned an empty body — HTTP 422."""


class JobAnalysisFetchTimeoutError(JobAnalysisError):
    """Source URL fetch timed out — HTTP 504."""


class JobAnalysisInvalidUrlError(JobAnalysisError):
    """Source URL was malformed — HTTP 400."""


# ---------------------------------------------------------------------------
# Validation tables — must match the prompt's enum guidance.
# ---------------------------------------------------------------------------


_VERDICTS: frozenset[str] = frozenset(
    ("strong_fit", "worth_considering", "stretch", "mismatch"),
)


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------


async def analyze(
    user_id: uuid.UUID,
    *,
    url: str | None,
    jd_text: str | None,
) -> JobAnalysis:
    """Run a fit-analysis for ``user_id`` on the given JD.

    Exactly one of ``url`` / ``jd_text`` must be non-empty (the request
    schema enforces this; this layer re-checks defensively). When ``url``
    is given, this function fetches it via ``jd_url_extractor.extract_from_url``
    and composes a JD text body from the structured extraction.

    For callers that already have JD text in hand (the discovery worker,
    the chrome extension), prefer :func:`score` directly — it skips URL
    resolution and accepts pre-extracted fields as a hint.

    Returns the :class:`JobAnalysis` row, committed in its own ``unit_of_work``.

    Raises:
        JobAnalysisInvalidUrlError: URL malformed.
        JobAnalysisFetchAuthRequiredError: URL auth-walled or empty body.
        JobAnalysisFetchTimeoutError: URL fetch timed out.
        JobAnalysisError: Claude failed, returned malformed JSON, or
            returned an envelope that didn't pass validation.
    """
    has_url = bool(url and url.strip())
    has_text = bool(jd_text and jd_text.strip())
    if has_url == has_text:
        raise JobAnalysisError(
            "analyze() requires exactly one of url / jd_text",
        )

    source_url: str | None
    resolved_jd_text: str
    if has_url:
        assert url is not None
        source_url = url.strip()
        try:
            extracted = await extract_from_url(source_url, user_id=user_id)
        except JDFetchAuthRequiredError as exc:
            raise JobAnalysisFetchAuthRequiredError(str(exc)) from exc
        except JDFetchTimeoutError as exc:
            raise JobAnalysisFetchTimeoutError(str(exc)) from exc
        except JDAiExtractionError as exc:
            raise JobAnalysisError.from_ai_failure(exc.kind) from exc
        except JDFetchError as exc:
            # The fetcher's messages already name the URL without its query.
            logger.warning(
                "Job posting fetch failed: user_id=%s url=%s err=%s",
                user_id, loggable_url(source_url), exc,
            )
            raise JobAnalysisError(str(exc)) from exc
        except ValueError as exc:
            raise JobAnalysisInvalidUrlError(str(exc)) from exc
        resolved_jd_text = join_extracted_text(extracted)
    else:
        assert jd_text is not None
        source_url = None
        resolved_jd_text = jd_text.strip()

    return await score(user_id, jd_text=resolved_jd_text, source_url=source_url)


async def score(
    user_id: uuid.UUID,
    *,
    jd_text: str,
    source_url: str | None = None,
    extracted_hint: dict | None = None,
) -> JobAnalysis:
    """Score pre-resolved JD text against ``user_id``'s profile and save the analysis.

    Pure JD-text-in, JobAnalysis-out: no URL fetching. :func:`analyze` and
    :func:`score_discovered_job` share :func:`_build_analysis`, so the rubric,
    validation and persisted shape stay the same across surfaces.

    No database connection is held while Claude runs: the profile is read in
    a short transaction that closes first, and the row is saved in a new one.

    Args:
        jd_text: The full JD text body. Must be non-empty after stripping.
        source_url: Optional canonical URL the JD came from. Used for the
            fingerprint and persisted on the JobAnalysis row.
        extracted_hint: Optional pre-extracted fields the caller already
            knows (title, company, location...). Hint values override
            Claude's ``extracted`` block for the fields they provide, so we
            don't pay Claude to re-extract what the source API returned.

    Raises:
        JobAnalysisError: Claude failed, returned malformed JSON, or
            returned an envelope that didn't pass validation.
    """
    analysis = await _build_analysis(
        user_id, jd_text=jd_text, source_url=source_url, extracted_hint=extracted_hint,
    )
    async with unit_of_work() as db:
        return await job_analysis_repository.create(db, analysis)


async def score_discovered_job(
    user_id: uuid.UUID,
    discovered_job_id: uuid.UUID,
    *,
    jd_text: str,
    source_url: str | None,
    extracted_hint: dict | None,
) -> JobAnalysis | None:
    """Score a discovered posting, saving the analysis and the posting's score in one commit.

    The posting is re-read, locked, after Claude answers. ``None`` (nothing
    saved) when it was removed meanwhile or another pass already scored it, so
    a posting never gets two analyses. The Claude call itself is logged against
    ``discovered_job_id`` in ``extraction_logs`` either way.

    Raises:
        JobAnalysisError: as :func:`score`.
    """
    analysis = await _build_analysis(
        user_id,
        jd_text=jd_text,
        source_url=source_url,
        extracted_hint=extracted_hint,
        context_id=discovered_job_id,
    )
    async with unit_of_work() as db:
        job = await discovery_repository.get_discovered(
            db, discovered_job_id, user_id, for_update=True,
        )
        if job is None or job.score is not None:
            logger.info(
                "Discovered job removed or already scored while Claude ran; not saved: job=%s",
                discovered_job_id,
            )
            return None
        saved = await job_analysis_repository.create(db, analysis)
        await discovery_repository.record_score(
            db, job, score=_verdict_to_score(saved.verdict), score_reason=saved.verdict_summary,
        )
        return saved


async def _build_analysis(
    user_id: uuid.UUID,
    *,
    jd_text: str,
    source_url: str | None,
    extracted_hint: dict | None,
    context_id: uuid.UUID | None = None,
) -> JobAnalysis:
    """Run the Claude analysis and return the (unsaved) row, with no session open during the call."""
    cleaned_jd = jd_text.strip() if jd_text else ""
    if not cleaned_jd:
        raise JobAnalysisError(
            "score() requires non-empty jd_text",
        )

    async with unit_of_work() as db:
        snapshot = await _load_profile_snapshot(db, user_id)

    user_content = _build_user_content(snapshot=snapshot, jd_text=cleaned_jd)
    try:
        meta = await claude_service.call_claude_with_meta(
            system_prompt=JOB_ANALYSIS_PROMPT,
            user_content=user_content,
            context_type="job_analysis",
            user_id=user_id,
            context_id=context_id,
        )
    except ExtractionError as exc:
        wrapped = JobAnalysisError.from_ai_failure(exc.kind, exc.error_type)
        logger.warning(
            "Claude job-analysis call failed: code=%s kind=%s status=%s",
            wrapped.code, exc.kind, exc.status,
        )
        raise wrapped from exc
    except ValueError as exc:
        logger.warning("Claude job-analysis response invalid: %s", exc)
        raise JobAnalysisError(str(exc), code=None, retryable=False) from exc

    try:
        validated = _validate_response(meta["parsed"])
    except JobAnalysisError as exc:
        logger.warning("Claude job-analysis response failed validation: user_id=%s err=%s", user_id, exc)
        raise

    if extracted_hint:
        merged = dict(validated["extracted"])
        for key, value in extracted_hint.items():
            if value is not None:
                merged[key] = value
        validated["extracted"] = merged

    return JobAnalysis(
        user_id=user_id,
        source_url=source_url,
        jd_text=cleaned_jd,
        fingerprint=_compute_fingerprint(source_url=source_url, jd_text=cleaned_jd),
        extracted=validated["extracted"],
        verdict=validated["verdict"],
        verdict_summary=validated["verdict_summary"],
        dimensions=validated["dimensions"],
        red_flags=validated["red_flags"],
        green_flags=validated["green_flags"],
        total_tokens_in=meta["input_tokens"],
        total_tokens_out=meta["output_tokens"],
        total_cost_usd=meta["cost_usd"],
    )


async def get_analysis(
    db: AsyncSession,
    user_id: uuid.UUID,
    analysis_id: uuid.UUID,
) -> JobAnalysis | None:
    """Return a non-deleted analysis scoped to ``user_id`` or ``None``."""
    return await job_analysis_repository.get_by_id(db, analysis_id, user_id)


async def soft_delete_analysis(
    user_id: uuid.UUID,
    analysis_id: uuid.UUID,
) -> bool:
    """Set ``deleted_at`` on the analysis. Idempotent — second DELETE
    on an already-deleted row also returns True."""
    async with unit_of_work() as db:
        analysis = await job_analysis_repository.get_by_id(
            db, analysis_id, user_id, include_deleted=True,
        )
        if analysis is None:
            return False
        await soft_delete(db, analysis)
    return True


# ---------------------------------------------------------------------------
# Response validation
# ---------------------------------------------------------------------------


def _validate_response(raw: Any) -> dict:
    """Validate Claude's parsed JSON against the analysis envelope.

    Returns a normalized dict ready to construct a :class:`JobAnalysis`
    row. Raises :class:`JobAnalysisError` when the response is missing
    required keys or has malformed types.

    Defensive normalization: out-of-enum status values are coerced to
    "unclear" (or the analogous "fallback" value per dimension) rather
    than rejected outright. Operators get a partial result instead of a
    HTTP 502 when the model deviates slightly from the rubric. The
    ``rationale`` is preserved verbatim so the operator can still see
    the reasoning even when the status is suspect.
    """
    if not isinstance(raw, dict):
        raise JobAnalysisError(
            f"Claude returned a non-dict envelope: {type(raw).__name__}",
        )

    verdict = _str_or_none(raw.get("verdict"))
    if verdict not in _VERDICTS:
        # The value is model output, and this message is logged and tagged in Sentry.
        raise JobAnalysisError(
            f"Claude returned an unknown verdict ({describe_model_output(verdict or '', stop_reason=None)})",
        )

    verdict_summary = _str_or_none(raw.get("verdict_summary")) or ""
    if not verdict_summary:
        raise JobAnalysisError("Claude returned an empty verdict_summary")

    extracted = validate_extracted(raw.get("extracted"))
    dimensions = validate_dimensions(raw.get("dimensions"))

    red_flags = flag_list(raw.get("red_flags"))
    green_flags = flag_list(raw.get("green_flags"))

    return {
        "verdict": verdict,
        "verdict_summary": verdict_summary,
        "extracted": extracted,
        "dimensions": dimensions,
        "red_flags": red_flags,
        "green_flags": green_flags,
    }



# ---------------------------------------------------------------------------
# Tiny utilities
# ---------------------------------------------------------------------------


def _compute_fingerprint(*, source_url: str | None, jd_text: str) -> str:
    """SHA-256 hex fingerprint for v2 idempotency.

    URL takes precedence — the same URL re-analyzed should produce the
    same fingerprint regardless of fetch-time HTML changes. JD text
    falls back to the trimmed first 256 chars.
    """
    material = (source_url or "").strip().lower()
    if not material:
        material = jd_text[:256].strip()
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _verdict_to_score(verdict: str) -> int:
    """Collapse a job-analysis verdict into a 0–100 integer sort key.

    Used by both the discovery inbox (ordering posted jobs by fit) and
    ``score()`` when writing back to a DiscoveredJob row in the same
    transaction. Keeping the mapping here ensures it stays co-located
    with the verdict enum values it references.
    """
    return {
        "strong_fit": 90,
        "worth_considering": 70,
        "stretch": 40,
        "mismatch": 15,
    }.get(verdict, 50)
