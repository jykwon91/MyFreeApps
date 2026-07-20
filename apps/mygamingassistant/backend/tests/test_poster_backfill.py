"""Unit tests for the poster backfill orchestrator.

Mirrors :mod:`test_micro_clip_backfill` — the selector query and the DB are
mocked out (``db = AsyncMock()`` + a patched
``lineup_repo.list_accepted_lineups_needing_posters``) so the tests exercise the
tally loop and its failure-isolation contract without depending on the shared
test DB's contents or the accepted-row check constraint. Unlike the clip
backfills there is no per-video grouping / download to assert — a poster is the
last frame of an already-uploaded clip, so the loop is a flat walk.
"""
from __future__ import annotations

import types
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.services.ingestion.poster_backfill import (
    PosterBackfillStats,
    backfill_posters,
)
from app.services.ingestion.poster_generator import PosterGenerationResult

_MOD = "app.services.ingestion.poster_backfill"


def _lineup(**kw):
    base = dict(id=uuid.uuid4(), title="t")
    base.update(kw)
    return types.SimpleNamespace(**base)


@pytest.mark.asyncio
async def test_no_lineups_returns_empty_stats():
    db = AsyncMock()
    with patch(
        f"{_MOD}.lineup_repo.list_accepted_lineups_needing_posters",
        AsyncMock(return_value=[]),
    ):
        stats = await backfill_posters(db)
    assert stats.total == 0
    assert stats.generated == 0
    assert stats.failed == 0
    assert stats.stand_generated == 0
    assert stats.landing_generated == 0


@pytest.mark.asyncio
async def test_tally_across_sides_independently():
    """A lineup with stand=generated + landing=failed counts one of each —
    the per-side tally is not collapsed into a coarse lineup-level bool."""
    db = AsyncMock()
    l1 = _lineup()

    gen = AsyncMock(
        return_value=PosterGenerationResult(
            stand_status="generated",
            landing_status="failed",
            stand_key="pending/v/5-stand-poster.webp",
            landing_error_codes=["ffmpeg:1"],
        )
    )
    with (
        patch(
            f"{_MOD}.lineup_repo.list_accepted_lineups_needing_posters",
            AsyncMock(return_value=[l1]),
        ),
        patch(f"{_MOD}.generate_posters_for_lineup", gen),
    ):
        stats = await backfill_posters(db)

    assert stats.total == 1
    assert stats.stand_generated == 1
    assert stats.landing_failed == 1
    assert stats.generated == 1
    assert stats.failed == 1  # advisory non-zero exit
    assert any("ffmpeg:1" in e for e in stats.errors)


@pytest.mark.asyncio
async def test_skipped_side_counts_as_skip_not_failure():
    """A pane with no source clip is a clean skip, never a failure."""
    db = AsyncMock()
    gen = AsyncMock(
        return_value=PosterGenerationResult(
            stand_status="generated",
            landing_status="skipped",
            stand_key="pending/v/5-stand-poster.webp",
        )
    )
    with (
        patch(
            f"{_MOD}.lineup_repo.list_accepted_lineups_needing_posters",
            AsyncMock(return_value=[_lineup()]),
        ),
        patch(f"{_MOD}.generate_posters_for_lineup", gen),
    ):
        stats = await backfill_posters(db)

    assert stats.stand_generated == 1
    assert stats.landing_skipped == 1
    assert stats.failed == 0


@pytest.mark.asyncio
async def test_unexpected_error_per_lineup_does_not_abort_batch():
    """A surprise exception on one lineup fails both its sides but must NOT
    break the rest of the batch."""
    db = AsyncMock()
    l_ok, l_bad = _lineup(), _lineup()

    call_count = {"n": 0}

    async def gen_side(_db, _lineup):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return PosterGenerationResult(
                stand_status="generated", landing_status="generated",
            )
        raise RuntimeError("surprise")

    with (
        patch(
            f"{_MOD}.lineup_repo.list_accepted_lineups_needing_posters",
            AsyncMock(return_value=[l_ok, l_bad]),
        ),
        patch(f"{_MOD}.generate_posters_for_lineup", AsyncMock(side_effect=gen_side)),
    ):
        stats = await backfill_posters(db)

    assert stats.total == 2
    assert stats.stand_generated == 1
    assert stats.landing_generated == 1
    assert stats.stand_failed == 1
    assert stats.landing_failed == 1
    assert any("surprise" in e for e in stats.errors)


def test_summary_shape():
    """The CLI-printed summary carries both per-side breakdowns."""
    stats = PosterBackfillStats(
        total=3, stand_generated=2, stand_skipped=1,
        landing_generated=1, landing_failed=2,
    )
    s = stats.summary()
    assert "backfill-posters: 3 candidate lineup(s)" in s
    assert "stand: 2g/1s/0f" in s
    assert "landing: 1g/0s/2f" in s
