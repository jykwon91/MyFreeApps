"""Unit tests for the widen-source backfill (python -m app.cli widen-source).

Mirrors :mod:`test_clip_backfill` / :mod:`test_landing_clip_backfill` —
everything external (repo query / yt-dlp / chapter parse / cut+upload /
persistence) is mocked. Asserts the idempotent work set per pane, ONE
fetch+download per video, chapter re-identification, the
widened/skipped/failed tally, and that the per-video download is always
cleaned up.
"""
from __future__ import annotations

import contextlib
import types
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ingestion.chapter_parser import Chapter
from app.services.ingestion.wide_source import WideSourceResult
from app.services.ingestion.widen_source_backfill import (
    backfill_widen_source,
)
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    YouTubeFetchError,
)

_MOD = "app.services.ingestion.widen_source_backfill"


def _lineup(
    video_id: str,
    chapter_start: int,
    *,
    clip_url: str | None = "tight.mp4",
    landing_clip_url: str | None = "tight-land.mp4",
    clip_url_original: str | None = None,
    landing_clip_url_original: str | None = None,
):
    """Build a lineup with the legacy posture (tight == wide) by default.

    Tests can override individual columns to model already-widened panes or
    panes without a tight clip (e.g. ``clip_url=None`` for landing-only).
    """
    if clip_url_original is None:
        clip_url_original = clip_url  # legacy posture
    if landing_clip_url_original is None:
        landing_clip_url_original = landing_clip_url  # legacy posture
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        youtube_video_id=video_id,
        chapter_start_seconds=chapter_start,
        clip_url=clip_url,
        clip_url_original=clip_url_original,
        landing_clip_url=landing_clip_url,
        landing_clip_url_original=landing_clip_url_original,
    )


def _meta():
    m = MagicMock()
    m.description = ""
    m.duration = 120
    m.chapters = [{"start_time": 0, "end_time": 60, "title": "B smoke"}]
    return m


def _patches(
    tmp_path,
    *,
    lineups,
    chapters,
    wide,
    fetch=None,
    download=None,
    throw_persist=None,
    landing_persist=None,
):
    """Compose the backfill patch set; download writes a real temp file so
    the unlink-cleanup assertion is meaningful."""

    async def _dl(video_id, ddir):
        p = Path(ddir) / f"{video_id}.mp4"
        p.write_bytes(b"src")
        return p

    settings = MagicMock()
    settings.ingestion_download_dir = str(tmp_path)

    return [
        patch(f"{_MOD}.settings", settings),
        patch(
            f"{_MOD}.lineup_repo.list_accepted_lineups_needing_widen_source",
            new=AsyncMock(return_value=lineups),
        ),
        patch(
            f"{_MOD}.fetch_video_detail",
            new=fetch or AsyncMock(return_value=_meta()),
        ),
        patch(f"{_MOD}.parse_chapters", return_value=chapters),
        patch(
            f"{_MOD}.download_video",
            new=download or AsyncMock(side_effect=_dl),
        ),
        patch(f"{_MOD}.cut_and_upload_wide_source", new=wide),
        patch(
            f"{_MOD}.lineup_repo.set_clip_url_original",
            new=throw_persist or AsyncMock(),
        ),
        patch(
            f"{_MOD}.lineup_repo.set_landing_clip_url_original",
            new=landing_persist or AsyncMock(),
        ),
    ]


def _enter(stack):
    es = contextlib.ExitStack()
    for p in stack:
        es.enter_context(p)
    return es


def _wide_ok(source_key="pending/v/0-clip-source.mp4"):
    return WideSourceResult(
        source_key=source_key, source_start_s=0.0, source_duration_s=60.0,
    )


def _wide_fail():
    return WideSourceResult(error_codes=["wide_source_cut:rc=1"])


# ---------------------------------------------------------------------------


class TestWidenSourceBackfill:
    @pytest.mark.asyncio
    async def test_nothing_to_do(self, tmp_path: Path):
        """Empty candidate list → no fetch, no download, no widen."""
        wide = AsyncMock()
        with _enter(_patches(tmp_path, lineups=[], chapters=[], wide=wide)):
            stats = await backfill_widen_source(MagicMock())
        assert stats.total_rows == 0
        assert stats.widened == 0
        wide.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_both_panes_widened_per_row(self, tmp_path: Path):
        """A row with both throw and landing legacy → 2 panes widened, 1 row."""
        lineups = [_lineup("vidA", 0)]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        wide = AsyncMock(return_value=_wide_ok())
        throw_persist = AsyncMock()
        landing_persist = AsyncMock()

        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, wide=wide,
            throw_persist=throw_persist, landing_persist=landing_persist,
        )):
            stats = await backfill_widen_source(MagicMock())

        assert stats.total_rows == 1
        assert stats.widened == 2  # throw + landing
        assert stats.failed == 0
        # Two wide cuts (one per pane); two persist calls.
        assert wide.await_count == 2
        throw_persist.assert_awaited_once()
        landing_persist.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_only_throw_legacy_widens_only_throw(self, tmp_path: Path):
        """Landing already widened (clip_url_original != landing_clip_url)
        → only throw is in the work set; landing is left alone."""
        lineups = [_lineup(
            "vidA", 0,
            landing_clip_url="tight-land.mp4",
            landing_clip_url_original="wide-land.mp4",  # already widened
        )]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        wide = AsyncMock(return_value=_wide_ok())
        throw_persist = AsyncMock()
        landing_persist = AsyncMock()

        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, wide=wide,
            throw_persist=throw_persist, landing_persist=landing_persist,
        )):
            stats = await backfill_widen_source(MagicMock())

        assert stats.widened == 1
        wide.assert_awaited_once()
        throw_persist.assert_awaited_once()
        landing_persist.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_row_with_no_tight_clip_widens_neither(self, tmp_path: Path):
        """A row with both clip_url=None and landing_clip_url=None contributes
        nothing — _throw_needs_widen and _landing_needs_widen both False.
        (Such rows shouldn't appear in the candidate set, but be defensive.)"""
        lineups = [_lineup(
            "vidA", 0, clip_url=None, landing_clip_url=None,
        )]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        wide = AsyncMock()
        throw_persist = AsyncMock()
        landing_persist = AsyncMock()

        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, wide=wide,
            throw_persist=throw_persist, landing_persist=landing_persist,
        )):
            stats = await backfill_widen_source(MagicMock())

        assert stats.widened == 0
        wide.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_one_fetch_and_download_per_video(self, tmp_path: Path):
        """3 rows, 2 share video 'vidA' → ONE fetch + ONE download per
        distinct video, not per row. Same shape as clip_backfill."""
        lineups = [
            _lineup("vidA", 0), _lineup("vidA", 0), _lineup("vidB", 0),
        ]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        wide = AsyncMock(return_value=_wide_ok())
        fetch = AsyncMock(return_value=_meta())
        dl_calls = []

        async def _dl(video_id, ddir):
            dl_calls.append(video_id)
            p = Path(ddir) / f"{video_id}.mp4"
            p.write_bytes(b"src")
            return p

        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, wide=wide,
            fetch=fetch, download=AsyncMock(side_effect=_dl),
        )):
            stats = await backfill_widen_source(MagicMock())

        assert stats.total_rows == 3
        # 3 rows × 2 panes each = 6 wide cuts.
        assert stats.widened == 6
        # ONE fetch + ONE download per distinct video.
        assert fetch.await_count == 2
        assert sorted(dl_calls) == ["vidA", "vidB"]
        # Downloaded files cleaned up.
        assert not (tmp_path / "vidA.mp4").exists()
        assert not (tmp_path / "vidB.mp4").exists()

    @pytest.mark.asyncio
    async def test_throw_failure_does_not_block_landing(self, tmp_path: Path):
        """The two panes are independent. A throw widen failure on a row
        must NOT prevent the landing widen on the SAME row from being
        attempted."""
        lineups = [_lineup("v", 0)]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        # First wide call (throw) fails; second (landing) succeeds.
        wide = AsyncMock(side_effect=[_wide_fail(), _wide_ok()])
        throw_persist = AsyncMock()
        landing_persist = AsyncMock()

        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, wide=wide,
            throw_persist=throw_persist, landing_persist=landing_persist,
        )):
            stats = await backfill_widen_source(MagicMock())

        assert stats.widened == 1   # landing succeeded
        assert stats.failed == 1    # throw failed
        # Throw persist not awaited (cut failed); landing persist was.
        throw_persist.assert_not_awaited()
        landing_persist.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_persist_failure_recorded_as_per_pane_failure(
        self, tmp_path: Path,
    ):
        """When the wide cut succeeds but the DB persist fails, the pane is
        counted as failed and the error includes the lineup id + pane."""
        lineups = [_lineup("v", 0)]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        wide = AsyncMock(return_value=_wide_ok())
        throw_persist = AsyncMock(side_effect=RuntimeError("db down"))
        landing_persist = AsyncMock()

        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, wide=wide,
            throw_persist=throw_persist, landing_persist=landing_persist,
        )):
            stats = await backfill_widen_source(MagicMock())

        assert stats.failed == 1   # throw persist failed
        assert stats.widened == 1  # landing succeeded
        assert any("[throw]" in e and "persist_failed" in e for e in stats.errors)

    @pytest.mark.asyncio
    async def test_metadata_fetch_failure_fails_all_panes_for_video(
        self, tmp_path: Path,
    ):
        lineups = [_lineup("vbad", 0), _lineup("vbad", 30)]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        fetch = AsyncMock(side_effect=YouTubeFetchError(
            "gone", error_type="ExtractorError", original=Exception(),
        ))
        wide = AsyncMock()

        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, wide=wide,
            fetch=fetch,
        )):
            stats = await backfill_widen_source(MagicMock())

        # 2 rows × 2 panes each = 4 panes blocked.
        assert stats.failed == 4
        wide.assert_not_awaited()
        assert any("ExtractorError" in e for e in stats.errors)

    @pytest.mark.asyncio
    async def test_download_failure_fails_all_panes_for_video(
        self, tmp_path: Path,
    ):
        lineups = [_lineup("vdl", 0)]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        dl = AsyncMock(side_effect=VideoDownloadError(
            "nope", video_id="vdl",
            error_type="UnavailableVideoError", original=Exception(),
        ))
        wide = AsyncMock()

        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, wide=wide,
            download=dl,
        )):
            stats = await backfill_widen_source(MagicMock())

        assert stats.failed == 2  # throw + landing for the one row
        wide.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_chapter_not_found_skips_both_panes(self, tmp_path: Path):
        """Video chapters changed since ingest — both panes skipped (not
        failed; this is a recoverable state if the video gets fixed)."""
        # lineup recorded chapter_start=999 but the video now has only [0,60].
        lineups = [_lineup("v", 999)]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        wide = AsyncMock()

        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, wide=wide,
        )):
            stats = await backfill_widen_source(MagicMock())

        assert stats.skipped == 2  # throw + landing both skipped
        wide.assert_not_awaited()
        assert any("chapter not found" in e for e in stats.errors)

    @pytest.mark.asyncio
    async def test_per_pane_exception_does_not_abort_batch(
        self, tmp_path: Path,
    ):
        """A raised exception on one row's pane must not abort the next row.
        Mirrors :func:`test_clip_backfill.test_per_lineup_exception_does_not_abort_batch`."""
        lineups = [_lineup("v", 0), _lineup("v", 0)]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        # First throw raises, then subsequent calls succeed.
        wide = AsyncMock(side_effect=[
            RuntimeError("boom"),  # row 1 throw — raises
            _wide_ok(),            # row 1 landing — succeeds
            _wide_ok(),            # row 2 throw — succeeds
            _wide_ok(),            # row 2 landing — succeeds
        ])

        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, wide=wide,
        )):
            stats = await backfill_widen_source(MagicMock())

        # 3 panes widened, 1 failed (the raised throw on row 1).
        assert stats.widened == 3
        assert stats.failed == 1

    @pytest.mark.asyncio
    async def test_summary_text_is_useful(self, tmp_path: Path):
        """Summary string surfaces both per-row total AND per-pane outcomes."""
        lineups = [_lineup("v", 0)]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        wide = AsyncMock(return_value=_wide_ok())

        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, wide=wide,
        )):
            stats = await backfill_widen_source(MagicMock())

        summary = stats.summary()
        assert "1 candidate row" in summary
        assert "2 pane(s) widened" in summary
