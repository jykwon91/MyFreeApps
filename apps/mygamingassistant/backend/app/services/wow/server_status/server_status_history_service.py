"""Record WoW Forever server status on a schedule, purge old rows, read the history.

Recording is run by the scheduler (``record_wow_server_status``, every
``RECORD_INTERVAL`` and once at boot, switch ``WOW_SERVER_STATUS_RECORDING_ENABLED``)
and by ``python -m app.cli record-wow-server-status``. Per region:

* Blizzard is asked first, outside any transaction (the live endpoint's
  60-second cache is shared, so a visitor and the recorder never double up);
* a failed call stores nothing — the history shows a gap, never "down" — and
  is logged at WARNING with Blizzard's error details;
* inside one transaction, a per-region advisory lock (so an overlapping run,
  the scheduler and the CLI at once, skips) then only the rulesets whose status changed, or whose newest
  row is a checkpoint interval old, get a row.
"""
from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Sequence
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_server_status import HISTORY_RETENTION, HISTORY_WINDOW, SERVER_STATUS_REGIONS
from app.db.session import unit_of_work
from app.repositories.wow import server_status_sample_repo
from app.schemas.wow.server_status import ServerStatusResponse
from app.schemas.wow.server_status_history import ServerStatusHistoryResponse
from app.services.wow.server_status.change_detection import observed_rulesets, rulesets_to_store
from app.services.wow.server_status.history_mapper import to_history_response
from app.services.wow.server_status.record_outcome import (
    OUTCOME_EMPTY,
    OUTCOME_FAILED,
    OUTCOME_LOCKED,
    OUTCOME_RECORDED,
    RegionRecordOutcome,
)
from app.services.wow.server_status_client import ServerStatusUpstreamError, get_region_status

logger = logging.getLogger(__name__)

StatusFetcher = Callable[[str], Awaitable[ServerStatusResponse]]


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def record_region(
    db: AsyncSession, status: ServerStatusResponse, *, now: datetime | None = None,
) -> RegionRecordOutcome:
    """Store what changed in ``status`` inside the caller's transaction."""
    at = now or _now()
    region = status.region
    if not await server_status_sample_repo.try_lock_region(db, region):
        logger.info("wow server status: %s is being recorded by another worker — skipped", region)
        return RegionRecordOutcome(region, OUTCOME_LOCKED, 0)
    latest = {
        slug: (row.status, row.observed_at)
        for slug, row in (await server_status_sample_repo.latest_per_ruleset(db, region)).items()
    }
    due = rulesets_to_store(latest, observed_rulesets(status.rulesets), at)
    await server_status_sample_repo.add_many(
        db, [{"region": region, "ruleset": r.slug, "status": r.status, "observed_at": at} for r in due],
    )
    return RegionRecordOutcome(region, OUTCOME_RECORDED, len(due))


async def record_all(
    regions: Sequence[str] = SERVER_STATUS_REGIONS,
    fetch: StatusFetcher = get_region_status,
) -> list[RegionRecordOutcome]:
    """Record every region, each in its own transaction. One failing never stops the others."""
    outcomes: list[RegionRecordOutcome] = []
    for region in regions:
        try:
            status = await fetch(region)
        except ServerStatusUpstreamError as exc:
            logger.warning("wow server status: %s not recorded — Blizzard call failed: %s", region, exc)
            outcomes.append(RegionRecordOutcome(region, OUTCOME_FAILED, 0, str(exc)))
            continue
        if not status.rulesets:
            logger.warning("wow server status: %s not recorded — Blizzard listed no rulesets", region)
            outcomes.append(RegionRecordOutcome(region, OUTCOME_EMPTY, 0))
            continue
        try:
            async with unit_of_work() as db:
                outcomes.append(await record_region(db, status))
        except Exception as exc:
            logger.exception("wow server status: %s recording crashed — nothing stored", region)
            outcomes.append(RegionRecordOutcome(region, OUTCOME_FAILED, 0, str(exc)))
    return outcomes


async def purge_old(*, now: datetime | None = None) -> int:
    """Delete rows older than ``HISTORY_RETENTION``; returns how many."""
    cutoff = (now or _now()) - HISTORY_RETENTION
    async with unit_of_work() as db:
        deleted = await server_status_sample_repo.delete_before(db, cutoff)
    logger.info("wow server status: purged %d rows older than %s", deleted, cutoff.isoformat())
    return deleted


async def get_history(db: AsyncSession, region: str, *, now: datetime | None = None) -> ServerStatusHistoryResponse:
    """The last ``HISTORY_WINDOW`` of recorded status for ``region``; empty rulesets when nothing is stored."""
    at = now or _now()
    window_start = at - HISTORY_WINDOW
    return to_history_response(
        region,
        generated_at=at,
        window_start=window_start,
        opening=await server_status_sample_repo.latest_before(db, region, window_start),
        in_window=await server_status_sample_repo.list_since(db, region, window_start),
        streaks=await server_status_sample_repo.streaks(db, region),
    )
