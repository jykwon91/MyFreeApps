"""Unit tests for the PR5 landing-clip backfill orchestrator.

Asserts the per-video grouping (one fetch + one download per video), the
chapter-start match logic, and the structured generated / skipped / failed
tallying. Mirrors :mod:`test_clip_backfill` (PR2) — the two backfills
share the same orchestration shape and the two test modules are kept in
sync.
"""
from __future__ import annotations

import types
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ingestion.landing_clip_backfill import (
    LandingClipBackfillStats,
    backfill_landing_clips,
)
from app.services.ingestion.landing_clip_generator import (
    LandingClipGenerationResult,
)
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    YouTubeFetchError,
)

_MOD = "app.services.ingestion.landing_clip_backfill"


def _lineup(video_id="vidA", chapter_start=10, **kw):
    base = dict(
        id=uuid.uuid4(),
        youtube_video_id=video_id,
        chapter_start_seconds=chapter_start,
        utility_type_id=None,
        title="t",
    )
    base.update(kw)
    return types.SimpleNamespace(**base)


def _meta(video_id="vidA", description="0:00 intro\n0:10 lineup",
          duration=300, chapters=None):
    return types.SimpleNamespace(
        video_id=video_id, title="t", description=description,
        duration=duration, chapters=chapters, url=f"https://yt/{video_id}",
        channel_name="ch",
    )


def _chapter(start=10, end=30, title="lineup"):
    return types.SimpleNamespace(
        start_seconds=start, end_seconds=end, title=title,
    )


def _settings(download_dir="/tmp/x"):
    s = MagicMock()
    s.ingestion_download_dir = download_dir
    return s


@pytest.mark.asyncio
async def test_no_lineups_returns_empty_stats():
    db = AsyncMock()
    with (
        patch(
            f"{_MOD}.lineup_repo.list_accepted_lineups_needing_landing_clips",
            AsyncMock(return_value=[]),
        ),
        patch(f"{_MOD}.settings", _settings()),
    ):
        stats = await backfill_landing_clips(db)
    assert stats.total == 0
    assert stats.generated == 0
    assert stats.skipped == 0
    assert stats.failed == 0


@pytest.mark.asyncio
async def test_groups_lineups_per_video_one_download(tmp_path):
    """Two lineups on the same video → one metadata fetch + one download."""
    db = AsyncMock()
    l1 = _lineup(video_id="vidA", chapter_start=10)
    l2 = _lineup(video_id="vidA", chapter_start=40)
    l3 = _lineup(video_id="vidB", chapter_start=12)

    download = AsyncMock(side_effect=lambda vid, _dir: tmp_path / f"{vid}.mp4")
    fetch_detail = AsyncMock(side_effect=lambda vid: _meta(video_id=vid))
    parse = MagicMock(return_value=[_chapter(10, 30), _chapter(40, 60),
                                    _chapter(12, 40)])
    gen = AsyncMock(return_value=LandingClipGenerationResult(
        status="generated", clip_key="k",
    ))

    with (
        patch(
            f"{_MOD}.lineup_repo.list_accepted_lineups_needing_landing_clips",
            AsyncMock(return_value=[l1, l2, l3]),
        ),
        patch(f"{_MOD}.settings", _settings(str(tmp_path))),
        patch(f"{_MOD}.fetch_video_detail", fetch_detail),
        patch(f"{_MOD}.parse_chapters", parse),
        patch(f"{_MOD}.download_video", download),
        patch(f"{_MOD}.generate_landing_clip_for_lineup", gen),
    ):
        # Materialize the videos so the unlink in the finally doesn't fail
        for v in ("vidA", "vidB"):
            (tmp_path / f"{v}.mp4").write_bytes(b"x")
        stats = await backfill_landing_clips(db)

    assert stats.total == 3
    assert stats.generated == 3
    # Exactly 2 downloads (one per video) — proves the per-video grouping.
    assert download.await_count == 2
    assert fetch_detail.await_count == 2


@pytest.mark.asyncio
async def test_metadata_fetch_failure_marks_all_lineups_failed(tmp_path):
    db = AsyncMock()
    l1 = _lineup(video_id="vidX", chapter_start=10)
    l2 = _lineup(video_id="vidX", chapter_start=20)

    with (
        patch(
            f"{_MOD}.lineup_repo.list_accepted_lineups_needing_landing_clips",
            AsyncMock(return_value=[l1, l2]),
        ),
        patch(f"{_MOD}.settings", _settings(str(tmp_path))),
        patch(
            f"{_MOD}.fetch_video_detail",
            AsyncMock(side_effect=YouTubeFetchError(
                "boom", error_type="network", original=Exception(),
            )),
        ),
    ):
        stats = await backfill_landing_clips(db)

    assert stats.total == 2
    assert stats.failed == 2
    assert stats.generated == 0


@pytest.mark.asyncio
async def test_download_failure_marks_all_video_lineups_failed(tmp_path):
    db = AsyncMock()
    l1 = _lineup(video_id="vidY", chapter_start=10)
    l2 = _lineup(video_id="vidY", chapter_start=20)

    with (
        patch(
            f"{_MOD}.lineup_repo.list_accepted_lineups_needing_landing_clips",
            AsyncMock(return_value=[l1, l2]),
        ),
        patch(f"{_MOD}.settings", _settings(str(tmp_path))),
        patch(
            f"{_MOD}.fetch_video_detail",
            AsyncMock(return_value=_meta(video_id="vidY")),
        ),
        patch(f"{_MOD}.parse_chapters", MagicMock(return_value=[_chapter()])),
        patch(
            f"{_MOD}.download_video",
            AsyncMock(side_effect=VideoDownloadError(
                "boom", video_id="vidY",
                error_type="404", original=Exception(),
            )),
        ),
    ):
        stats = await backfill_landing_clips(db)

    assert stats.total == 2
    assert stats.failed == 2


@pytest.mark.asyncio
async def test_chapter_not_found_skips_that_lineup_only(tmp_path):
    """Video changed since ingest → one lineup skipped, the rest still run."""
    db = AsyncMock()
    l_match = _lineup(video_id="vidZ", chapter_start=10)
    l_miss = _lineup(video_id="vidZ", chapter_start=99)

    download = AsyncMock(side_effect=lambda vid, _dir: tmp_path / f"{vid}.mp4")
    gen = AsyncMock(return_value=LandingClipGenerationResult(
        status="generated", clip_key="k",
    ))
    (tmp_path / "vidZ.mp4").write_bytes(b"x")

    with (
        patch(
            f"{_MOD}.lineup_repo.list_accepted_lineups_needing_landing_clips",
            AsyncMock(return_value=[l_match, l_miss]),
        ),
        patch(f"{_MOD}.settings", _settings(str(tmp_path))),
        patch(
            f"{_MOD}.fetch_video_detail",
            AsyncMock(return_value=_meta(video_id="vidZ")),
        ),
        patch(
            f"{_MOD}.parse_chapters",
            MagicMock(return_value=[_chapter(start=10, end=20)]),
        ),
        patch(f"{_MOD}.download_video", download),
        patch(f"{_MOD}.generate_landing_clip_for_lineup", gen),
    ):
        stats = await backfill_landing_clips(db)

    assert stats.total == 2
    assert stats.generated == 1
    assert stats.skipped == 1


@pytest.mark.asyncio
async def test_unexpected_error_per_lineup_does_not_abort_batch(tmp_path):
    """A surprise exception on one lineup must NOT break the rest of the batch."""
    db = AsyncMock()
    l_ok = _lineup(video_id="vidQ", chapter_start=10)
    l_bad = _lineup(video_id="vidQ", chapter_start=40)

    download = AsyncMock(side_effect=lambda vid, _dir: tmp_path / f"{vid}.mp4")
    (tmp_path / "vidQ.mp4").write_bytes(b"x")

    # First call succeeds, second raises a surprise.
    call_count = {"n": 0}

    async def gen_side(*a, **kw):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return LandingClipGenerationResult(status="generated", clip_key="k")
        raise RuntimeError("surprise")

    with (
        patch(
            f"{_MOD}.lineup_repo.list_accepted_lineups_needing_landing_clips",
            AsyncMock(return_value=[l_ok, l_bad]),
        ),
        patch(f"{_MOD}.settings", _settings(str(tmp_path))),
        patch(
            f"{_MOD}.fetch_video_detail",
            AsyncMock(return_value=_meta(video_id="vidQ")),
        ),
        patch(
            f"{_MOD}.parse_chapters",
            MagicMock(return_value=[_chapter(10, 30), _chapter(40, 60)]),
        ),
        patch(f"{_MOD}.download_video", download),
        patch(
            f"{_MOD}.generate_landing_clip_for_lineup",
            AsyncMock(side_effect=gen_side),
        ),
    ):
        stats = await backfill_landing_clips(db)

    assert stats.total == 2
    assert stats.generated == 1
    assert stats.failed == 1
    assert any("surprise" in e for e in stats.errors)
