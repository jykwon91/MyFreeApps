"""WoW Forever server status history — recorder, retention, reads and the route.

Covers:
  - change detection: first sighting, unchanged (skipped), changed, checkpoint due
  - record_region: only changes + checkpoints are written; a held lock skips
  - record_all: a Blizzard failure / empty answer stores nothing and logs why;
    one region failing never stops the others
  - retention: rows older than 90 days are deleted, newer ones kept
  - repository: streak start (exact / lower bound), the window's opening row
  - GET /api/wow/server-status/history: public in both modes, shape, bad region
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.wow_server_status import (
    CHECKPOINT_INTERVAL,
    HISTORY_RETENTION,
    HISTORY_WINDOW,
    MAX_SAMPLE_GAP,
    STATUS_DOWN,
    STATUS_UP,
)
from app.models.wow.server_status_sample import WowServerStatusSample
from app.repositories.wow import server_status_sample_repo
from app.schemas.wow.server_status import ServerRuleset, ServerStatusResponse
from app.services.wow.server_status import server_status_history_service as svc
from app.services.wow.server_status.change_detection import observed_rulesets, rulesets_to_store
from app.services.wow.server_status.observed_ruleset import ObservedRuleset
from app.services.wow.server_status.record_outcome import (
    OUTCOME_EMPTY,
    OUTCOME_FAILED,
    OUTCOME_LOCKED,
    OUTCOME_RECORDED,
)
from app.services.wow.server_status_client import ServerStatusUpstreamError

URL = "/api/wow/server-status/history"
NOW = datetime(2026, 11, 7, 18, 0, tzinfo=timezone.utc)
SLUGS = ("normal", "pvp", "roleplay", "roleplay-pvp")


def _status(region: str = "us", down: tuple[str, ...] = ()) -> ServerStatusResponse:
    return ServerStatusResponse(
        region=region,
        checked_at=NOW,
        rulesets=[ServerRuleset(name=s, slug=s, online=s not in down) for s in SLUGS],
    )


def _row(ruleset: str, status: str, at: datetime, region: str = "us") -> WowServerStatusSample:
    return WowServerStatusSample(region=region, ruleset=ruleset, status=status, observed_at=at)


@pytest_asyncio.fixture
async def empty_history(db: AsyncSession) -> AsyncSession:
    """No stored status rows (the dev DB may hold real ones); rolled back after the test."""
    await db.execute(delete(WowServerStatusSample))
    return db


async def _stored(db: AsyncSession, region: str = "us") -> list[tuple[str, str, datetime]]:
    result = await db.execute(
        select(WowServerStatusSample)
        .where(WowServerStatusSample.region == region)
        .order_by(WowServerStatusSample.observed_at, WowServerStatusSample.ruleset)
    )
    return [(r.ruleset, r.status, r.observed_at) for r in result.scalars()]


# ---------------------------------------------------------------------------
# change detection (pure)
# ---------------------------------------------------------------------------

def test_first_sighting_is_stored() -> None:
    observed = [ObservedRuleset("normal", STATUS_UP)]
    assert rulesets_to_store({}, observed, NOW) == observed


def test_unchanged_recent_status_is_skipped() -> None:
    latest = {"normal": (STATUS_UP, NOW - timedelta(minutes=10))}
    assert rulesets_to_store(latest, [ObservedRuleset("normal", STATUS_UP)], NOW) == []


def test_changed_status_is_stored_even_right_after_the_last_row() -> None:
    latest = {"normal": (STATUS_UP, NOW - timedelta(seconds=30))}
    observed = [ObservedRuleset("normal", STATUS_DOWN)]
    assert rulesets_to_store(latest, observed, NOW) == observed


def test_checkpoint_is_due_after_the_interval() -> None:
    latest = {
        "normal": (STATUS_UP, NOW - CHECKPOINT_INTERVAL),
        "pvp": (STATUS_UP, NOW - CHECKPOINT_INTERVAL + timedelta(seconds=1)),
    }
    observed = [ObservedRuleset("normal", STATUS_UP), ObservedRuleset("pvp", STATUS_UP)]
    assert rulesets_to_store(latest, observed, NOW) == [ObservedRuleset("normal", STATUS_UP)]


def test_observed_rulesets_maps_online_and_drops_repeats() -> None:
    rulesets = [
        ServerRuleset(name="Normal", slug="normal", online=True),
        ServerRuleset(name="PvP", slug="pvp", online=False),
        ServerRuleset(name="Normal again", slug="normal", online=False),
        ServerRuleset(name="", slug="", online=True),
    ]
    assert observed_rulesets(rulesets) == [
        ObservedRuleset("normal", STATUS_UP),
        ObservedRuleset("pvp", STATUS_DOWN),
    ]


def test_max_gap_outlasts_a_checkpoint() -> None:
    # A ruleset that's quiet for a checkpoint interval must never read as "no data".
    assert MAX_SAMPLE_GAP > CHECKPOINT_INTERVAL


# ---------------------------------------------------------------------------
# record_region / record_all
# ---------------------------------------------------------------------------

async def test_record_region_writes_changes_and_checkpoints_only(empty_history: AsyncSession) -> None:
    db = empty_history
    first = await svc.record_region(db, _status(), now=NOW)
    assert (first.outcome, first.written) == (OUTCOME_RECORDED, 4)

    again = await svc.record_region(db, _status(), now=NOW + timedelta(minutes=5))
    assert again.written == 0

    change_at = NOW + timedelta(minutes=10)
    changed = await svc.record_region(db, _status(down=("pvp",)), now=change_at)
    assert changed.written == 1
    assert (await _stored(db))[-1] == ("pvp", STATUS_DOWN, change_at)

    # An hour after the first rows, the three unchanged rulesets get a checkpoint;
    # pvp's last row is only 50 minutes old.
    checkpoint = await svc.record_region(db, _status(down=("pvp",)), now=NOW + CHECKPOINT_INTERVAL)
    assert checkpoint.written == 3
    assert len(await _stored(db)) == 8


async def test_record_region_skips_when_another_worker_holds_the_lock(
    empty_history: AsyncSession, db_engine,
) -> None:
    async with db_engine.connect() as other:
        trans = await other.begin()
        try:
            async with AsyncSession(bind=other) as other_session:
                assert await server_status_sample_repo.try_lock_region(other_session, "us")
                outcome = await svc.record_region(empty_history, _status(), now=NOW)
        finally:
            await trans.rollback()
    assert (outcome.outcome, outcome.written) == (OUTCOME_LOCKED, 0)
    assert await _stored(empty_history) == []


async def test_record_all_stores_nothing_when_blizzard_fails_and_keeps_going(
    empty_history: AsyncSession, bound_unit_of_work: AsyncSession, caplog: pytest.LogCaptureFixture,
) -> None:
    async def fetch(region: str) -> ServerStatusResponse:
        if region == "eu":
            raise ServerStatusUpstreamError("Blizzard returned errors for region=eu: ['InternalServerError']")
        if region == "kr":
            return ServerStatusResponse(region="kr", checked_at=NOW, rulesets=[])
        return _status(region)

    with caplog.at_level(logging.WARNING):
        outcomes = await svc.record_all(regions=("us", "eu", "kr"), fetch=fetch)

    by_region = {o.region: o for o in outcomes}
    assert by_region["us"].outcome == OUTCOME_RECORDED and by_region["us"].written == 4
    assert by_region["eu"].outcome == OUTCOME_FAILED
    assert "InternalServerError" in (by_region["eu"].error or "")
    assert by_region["kr"].outcome == OUTCOME_EMPTY
    assert await _stored(empty_history, "eu") == []
    assert await _stored(empty_history, "kr") == []
    # The failure reason reaches the logs, never just "failed".
    assert any("InternalServerError" in r.getMessage() for r in caplog.records)


# ---------------------------------------------------------------------------
# retention
# ---------------------------------------------------------------------------

async def test_purge_deletes_rows_older_than_retention(
    empty_history: AsyncSession, bound_unit_of_work: AsyncSession,
) -> None:
    db = empty_history
    old = NOW - HISTORY_RETENTION - timedelta(minutes=1)
    kept = NOW - HISTORY_RETENTION + timedelta(minutes=1)
    db.add_all([_row("normal", STATUS_UP, old), _row("pvp", STATUS_UP, old), _row("normal", STATUS_UP, kept)])
    await db.flush()

    assert await svc.purge_old(now=NOW) == 2
    assert await _stored(db) == [("normal", STATUS_UP, kept)]


# ---------------------------------------------------------------------------
# repository reads + get_history
# ---------------------------------------------------------------------------

async def test_streak_starts_after_the_last_different_status(empty_history: AsyncSession) -> None:
    db = empty_history
    db.add_all([
        _row("normal", STATUS_UP, NOW - timedelta(hours=5)),
        _row("normal", STATUS_DOWN, NOW - timedelta(hours=3)),
        _row("normal", STATUS_DOWN, NOW - timedelta(hours=2)),
        _row("normal", STATUS_UP, NOW - timedelta(hours=1)),
        _row("normal", STATUS_UP, NOW),
        _row("pvp", STATUS_UP, NOW - timedelta(hours=4)),
        _row("pvp", STATUS_UP, NOW),
        _row("pvp", STATUS_DOWN, NOW - timedelta(days=1), region="eu"),
    ])
    await db.flush()

    streaks = await server_status_sample_repo.streaks(db, "us")
    assert streaks["normal"].since == NOW - timedelta(hours=1) and streaks["normal"].exact is True
    # No other status on record: the oldest row is only a lower bound.
    assert streaks["pvp"].since == NOW - timedelta(hours=4) and streaks["pvp"].exact is False


async def test_get_history_includes_the_row_the_window_opens_with(empty_history: AsyncSession) -> None:
    db = empty_history
    window_start = NOW - HISTORY_WINDOW
    db.add_all([
        _row("pvp", STATUS_DOWN, window_start - timedelta(days=2)),
        _row("pvp", STATUS_UP, window_start - timedelta(minutes=20)),
        _row("pvp", STATUS_DOWN, NOW - timedelta(hours=2)),
        _row("normal", STATUS_UP, NOW - timedelta(minutes=30)),
        _row("brand-new", STATUS_UP, NOW - timedelta(minutes=30)),
    ])
    await db.flush()

    history = await svc.get_history(db, "us", now=NOW)
    assert history.window_start == window_start
    assert history.max_gap_seconds == int(MAX_SAMPLE_GAP.total_seconds())
    assert [r.slug for r in history.rulesets] == ["normal", "pvp", "brand-new"]
    assert [r.name for r in history.rulesets] == ["Normal", "PvP", "Brand New"]

    pvp = history.rulesets[1]
    assert [(p.at, p.status) for p in pvp.points] == [
        (window_start - timedelta(minutes=20), STATUS_UP),
        (NOW - timedelta(hours=2), STATUS_DOWN),
    ]
    assert pvp.since == NOW - timedelta(hours=2) and pvp.since_exact is True


# ---------------------------------------------------------------------------
# GET /api/wow/server-status/history
# ---------------------------------------------------------------------------

async def test_history_route_returns_recorded_points(client: AsyncClient, empty_history: AsyncSession) -> None:
    at = datetime.now(timezone.utc) - timedelta(minutes=15)
    empty_history.add_all([_row(s, STATUS_UP, at) for s in SLUGS])
    await empty_history.flush()

    resp = await client.get(URL, params={"region": "us"})
    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "public, max-age=60"
    body = resp.json()
    assert body["region"] == "us"
    assert body["check_interval_seconds"] == 300
    assert [r["slug"] for r in body["rulesets"]] == list(SLUGS)
    assert body["rulesets"][0]["points"][0]["status"] == "up"
    assert body["rulesets"][0]["since_exact"] is False


async def test_history_route_with_nothing_recorded(client: AsyncClient, empty_history: AsyncSession) -> None:
    resp = await client.get(URL, params={"region": "eu"})
    assert resp.status_code == 200
    assert resp.json()["rulesets"] == []


async def test_history_route_rejects_unknown_region(client: AsyncClient) -> None:
    resp = await client.get(URL, params={"region": "mars"})
    assert resp.status_code == 422


async def test_history_route_is_public_in_serve_only(
    serve_only_client: AsyncClient, empty_history: AsyncSession,
) -> None:
    resp = await serve_only_client.get(URL, params={"region": "us"})
    assert resp.status_code == 200
