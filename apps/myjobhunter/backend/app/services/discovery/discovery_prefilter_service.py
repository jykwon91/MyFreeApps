"""Two-stage scoring prefilter (PR 4b).

The discovery scoring loop used to iterate every unscored posting
(``list_unscored_for_user``) and call Anthropic on each one. At
500-2000 postings/day per user this hit the per-user daily budget cap
fast and silently dropped the tail.

This service narrows the candidate set via cosine similarity to the
user's profile embedding BEFORE the loop hits Anthropic. With
``top_n=20`` and typical fetch volumes, the budget covers the same
20 highest-relevance postings every pass — a ~25x cost reduction at
the same end-user-visible score quality.

Two branches
============

1. **Embedding branch** (preferred): the user has a profile embedding
   (``profiles.embedding IS NOT NULL``). Rank unscored postings with
   embeddings by pgvector ``<=>`` cosine distance, return top N.
2. **FIFO fallback**: the user has no profile embedding yet (newly
   onboarded — hasn't filled in skills / work history / resume). Fall
   back to ``discovered_at DESC`` so the operator at least gets *some*
   scoring on their freshest postings while their profile ripens.
   The embedding becomes load-bearing only once the profile is rich
   enough to embed.

Postings with ``embedding IS NULL`` (race between fetch and embed
backfill) are skipped on the embedding branch and picked up by the
next pass once the embedding lands. On the FIFO branch, embedding-less
postings are eligible because we have nothing to rank against anyway.

Observability
=============

Each call emits a Sentry breadcrumb summarising the branch taken,
the eligible-count, and the returned-count. The score service reads
the returned set and sets per-pass tags
(``discovery.score_prefilter_top_n``,
``discovery.score_prefilter_branch``) so operators can see at a glance
how the score loop sized its work for each user without grepping
logs (per ``feedback_check_sentry_first.md``).

Failure shape
=============

If pgvector is not loaded or the cosine query raises, the exception
propagates — per ``rules/no-bandaid-solutions.md`` we do NOT catch
and degrade to FIFO. A failing prefilter is an infrastructure bug
(the PR 4a boot guard should have caught this) and silently degrading
would hide that. The score loop's caller is a BackgroundTask, so the
exception goes to Sentry rather than the request response.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Literal

import sentry_sdk
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.repositories.discovery import discovery_prefilter_repository

logger = logging.getLogger(__name__)


PrefilterBranch = Literal["embedding", "fifo_fallback"]


@dataclass(frozen=True)
class PrefilterResult:
    """Output shape for ``rank_unscored_for_user``.

    Carries both the chosen rows and the branch metadata so the score
    service can attach the right Sentry tags without re-querying.

    Attributes:
        rows: Up to ``top_n`` unscored DiscoveredJob rows, ranked by
            cosine similarity (embedding branch) or recency
            (FIFO branch). May be fewer than ``top_n`` when there are
            fewer eligible postings.
        branch: Which path produced ``rows`` — drives the Sentry tag
            ``discovery.score_prefilter_branch``.
        eligible_count: How many rows were eligible BEFORE the limit
            was applied. On the embedding branch, this is the count of
            unscored postings with embeddings (so the operator can see
            embed/fetch lag in Sentry). On the FIFO branch this is the
            same count returned by the FIFO query — we don't run a
            separate COUNT(*) because the FIFO path is the rare case.
    """

    rows: list[DiscoveredJob]
    branch: PrefilterBranch
    eligible_count: int


async def rank_unscored_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    top_n: int = 20,
) -> PrefilterResult:
    """Return up to ``top_n`` unscored postings, ranked by best-available signal.

    Picks the embedding branch when the user has a profile embedding;
    falls back to FIFO when they don't. Both branches return rows in
    the same shape — the caller iterates them identically.

    Args:
        db: An open AsyncSession. The caller owns the session lifecycle.
        user_id: Tenant-scoping identifier; every read is filtered by it.
        top_n: Maximum rows to return. Defaults to 20 — the cost-tuned
            sweet spot for a ~$0.30/day budget at ~$0.005/score.

    Returns:
        A ``PrefilterResult`` describing the chosen rows + branch metadata.
        ``rows`` is empty when there are no eligible postings — the score
        service treats that as a no-op pass.

    Raises:
        Any exception from pgvector / the DB driver propagates. Per
        ``rules/no-bandaid-solutions.md`` we do not catch and degrade —
        a failing prefilter is an infrastructure bug worth surfacing.
    """
    profile_embedding = (
        await discovery_prefilter_repository.get_profile_embedding(
            db, user_id,
        )
    )

    if profile_embedding is None:
        rows = await discovery_prefilter_repository.list_unscored_fifo_fallback(
            db, user_id, top_n=top_n,
        )
        result = PrefilterResult(
            rows=rows,
            branch="fifo_fallback",
            eligible_count=len(rows),
        )
        _emit_breadcrumb(user_id=user_id, result=result, top_n=top_n)
        logger.info(
            "discovery prefilter: branch=fifo_fallback user=%s "
            "returned=%d top_n=%d (no profile embedding)",
            user_id, len(rows), top_n,
        )
        return result

    eligible_count = (
        await discovery_prefilter_repository.count_unscored_with_embedding(
            db, user_id,
        )
    )
    rows = await discovery_prefilter_repository.list_unscored_with_embedding_ranked(
        db,
        user_id,
        profile_embedding=profile_embedding,
        top_n=top_n,
    )
    result = PrefilterResult(
        rows=rows,
        branch="embedding",
        eligible_count=eligible_count,
    )
    _emit_breadcrumb(user_id=user_id, result=result, top_n=top_n)
    logger.info(
        "discovery prefilter: branch=embedding user=%s "
        "eligible=%d returned=%d top_n=%d",
        user_id, eligible_count, len(rows), top_n,
    )
    return result


def _emit_breadcrumb(
    *,
    user_id: uuid.UUID,
    result: PrefilterResult,
    top_n: int,
) -> None:
    """Emit a structured Sentry breadcrumb summarising the prefilter pass.

    Per ``feedback_check_sentry_first.md``: every operationally-interesting
    decision in the discovery pipeline leaves a Sentry breadcrumb so the
    operator can reconstruct what happened from the dashboard alone.

    Breadcrumbs are scoped to the current Sentry hub — when the score
    service later captures an exception or message, the breadcrumb
    appears in the event's trail.
    """
    sentry_sdk.add_breadcrumb(
        category="discovery.prefilter",
        message=f"prefilter branch={result.branch} returned={len(result.rows)}",
        level="info",
        data={
            "user_id": str(user_id),
            "prefilter_branch": result.branch,
            "prefilter_eligible_count": result.eligible_count,
            "prefilter_returned_count": len(result.rows),
            "prefilter_top_n": top_n,
        },
    )
