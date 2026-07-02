"""Lineup re-classification service.

The interactive (post-ingest) classification path: re-run the Claude classifier
on an already-stored lineup, or across every pending lineup of a source,
honoring the source's operator-set map scope (Source.config_json ``map_hint`` /
``game_hint``).

Extracted from ``lineup_service`` (which had grown past the file-size budget) so
the reclassify concern — single + bulk, plus the source-scope resolution they
share — has a cohesive home. The map hard-lock itself lives in
``single_image_classifier.classify_lineup`` and mirrors the ingest grid
classifier; this module just resolves the scope and drives the calls.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.lineup import Lineup
from app.repositories.game import source_repo
from app.repositories.game.lineup_repo import (
    commit_classifier_run,
    get_lineup,
    list_pending_lineups,
)
from app.services.classification.classification_result import ClassificationResult
from app.services.classification.single_image_classifier import classify_lineup

logger = logging.getLogger(__name__)

# Per-call cap on the bulk source reclassify (reclassify_source_pending). A
# single source's pending queue is realistically far smaller; the cap bounds a
# pathological run and is surfaced (total > processed), never a silent drop.
_RECLASSIFY_BATCH_LIMIT = 500


async def _source_scope(
    db: AsyncSession,
    source_id: Optional[uuid.UUID],
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Return the (game_hint, map_hint, agent_hint) scope for a source id.

    The hints live in Source.config_json (set by the operator at create time or
    via ``PATCH /api/sources/{id}``). A missing source_id, or a soft-deleted
    source, yields (None, None, None) — classification then runs unscoped,
    exactly as it did before this wiring existed.
    """
    if source_id is None:
        return None, None, None
    source = await source_repo.get_source(db, source_id)
    if source is None:
        return None, None, None
    cfg = source.config_json or {}
    return cfg.get("game_hint"), cfg.get("map_hint"), cfg.get("agent_hint")


async def _source_scope_for_lineup(
    db: AsyncSession,
    lineup: Optional[Lineup],
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """The source scope for a lineup (SET NULL FK / manual upload → unscoped)."""
    if lineup is None:
        return None, None, None
    return await _source_scope(db, lineup.source_id)


async def reclassify(
    db: AsyncSession,
    lineup_id: uuid.UUID,
) -> ClassificationResult:
    """Re-run the Claude classifier on a single lineup and persist suggestions.

    Honors the lineup's source map scope: when the source has a ``map_hint``,
    the classified map is hard-locked to it (``apply_map_hint``), mirroring the
    ingest grid classifier. This is the fix for the interactive reclassify path
    silently ignoring a source's operator-set map scope.

    ``classify_lineup`` writes suggested_* fields and flushes but, per its
    documented contract, leaves the commit to the caller (the ingestion
    orchestrator batches; the interactive route commits one). Commit
    ownership for the interactive path lives in the repo
    (``commit_classifier_run``) so the route stays free of any ORM/DB call.
    On classifier failure nothing was flushed worth keeping, so no commit.
    """
    lineup = await get_lineup(db, lineup_id)
    game_hint, map_hint, agent_hint = await _source_scope_for_lineup(db, lineup)
    result = await classify_lineup(
        db, lineup_id, game_hint=game_hint, map_hint=map_hint, agent_hint=agent_hint
    )
    if result.success:
        await commit_classifier_run(db)
    return result


@dataclass
class ReclassifyBatchResult:
    """Counts from :func:`reclassify_source_pending`.

    ``total`` = pending_review lineups matched for the source; ``reclassified``
    / ``failed`` = how many were processed this call. ``total`` may exceed
    ``reclassified + failed`` when the source has more pending than the
    per-call cap.
    """
    total: int
    reclassified: int
    failed: int


async def reclassify_source_pending(
    db: AsyncSession,
    source_id: uuid.UUID,
) -> ReclassifyBatchResult:
    """Re-run the classifier on every pending_review lineup of a source.

    Resolves the source's map scope ONCE, then re-classifies each pending
    lineup with it — so a source the operator has just map-scoped gets its
    whole review backlog corrected in one action (the bulk counterpart to the
    per-lineup ``reclassify``, which applies the same hard-lock). Each lineup is
    isolated in try/except: one Claude/parse failure counts as ``failed``
    without aborting the batch. Suggestions flushed by the successful runs are
    committed once at the end. Synchronous — sized for the single-user scale;
    the per-call cap is surfaced via ``total > reclassified + failed`` rather
    than silently dropping the tail.
    """
    game_hint, map_hint, agent_hint = await _source_scope(db, source_id)
    lineups, total = await list_pending_lineups(
        db, source_id=source_id, limit=_RECLASSIFY_BATCH_LIMIT, offset=0
    )
    reclassified = 0
    failed = 0
    for lineup in lineups:
        try:
            result = await classify_lineup(
                db, lineup.id, game_hint=game_hint, map_hint=map_hint,
                agent_hint=agent_hint,
            )
        except Exception:
            logger.exception(
                "reclassify_source_pending: classify raised (counted as failed): "
                "source_id=%s lineup_id=%s",
                source_id, lineup.id,
            )
            failed += 1
            continue
        if result.success:
            reclassified += 1
        else:
            failed += 1
    if reclassified:
        await commit_classifier_run(db)
    return ReclassifyBatchResult(total=total, reclassified=reclassified, failed=failed)
