"""Unit tests for the PR2 backfill (python -m app.cli backfill-clips).

Everything external (repo query / yt-dlp / chapter parse / clip generation)
is mocked. Verifies the idempotent work set, ONE fetch+download per video
(not per lineup), chapter re-identification, the generated/skipped/failed
tally, and that the per-video download is always cleaned up.
"""
from __future__ import annotations

import types
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ingestion.chapter_parser import Chapter
from app.services.ingestion.clip_backfill import backfill_clips
from app.services.ingestion.clip_generator import ClipGenerationResult
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    YouTubeFetchError,
)

_MOD = "app.services.ingestion.clip_backfill"


def _lineup(video_id: str, chapter_start: int):
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        youtube_video_id=video_id,
        chapter_start_seconds=chapter_start,
        clip_url=None,
    )


def _meta():
    m = MagicMock()
    m.description = ""
    m.duration = 120
    m.chapters = [{"start_time": 0, "end_time": 60, "title": "B smoke"}]
    return m


def _patches(tmp_path, *, lineups, chapters, generate, fetch=None, download=None):
    """Compose the backfill patch set; download writes a real temp file so
    the unlink-cleanup assertion is meaningful."""
    dl_path = tmp_path / "video.mp4"

    async def _dl(video_id, ddir):
        p = Path(ddir) / f"{video_id}.mp4"
        p.write_bytes(b"src")
        return p

    settings = MagicMock()
    settings.ingestion_download_dir = str(tmp_path)

    stack = [
        patch(f"{_MOD}.settings", settings),
        patch(f"{_MOD}.lineup_repo.list_accepted_lineups_needing_clips",
              new=AsyncMock(return_value=lineups)),
        patch(f"{_MOD}.fetch_video_detail",
              new=fetch or AsyncMock(return_value=_meta())),
        patch(f"{_MOD}.parse_chapters", return_value=chapters),
        patch(f"{_MOD}.download_video",
              new=download or AsyncMock(side_effect=_dl)),
        patch(f"{_MOD}.generate_clip_for_lineup", new=generate),
    ]
    return stack


def _enter(stack):
    import contextlib
    es = contextlib.ExitStack()
    for p in stack:
        es.enter_context(p)
    return es


class TestBackfill:
    @pytest.mark.asyncio
    async def test_nothing_to_do(self, tmp_path: Path):
        gen = AsyncMock()
        with _enter(_patches(tmp_path, lineups=[], chapters=[], generate=gen)):
            stats = await backfill_clips(MagicMock())
        assert stats.total == 0
        assert stats.generated == 0
        gen.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_one_fetch_and_download_per_video(self, tmp_path: Path):
        # 3 lineups, 2 of them share video "vidA".
        lineups = [
            _lineup("vidA", 0), _lineup("vidA", 0), _lineup("vidB", 0),
        ]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="B smoke")]
        gen = AsyncMock(return_value=ClipGenerationResult(
            status="generated", clip_key="k"))
        fetch = AsyncMock(return_value=_meta())
        dl_calls = []

        async def _dl(video_id, ddir):
            dl_calls.append(video_id)
            p = Path(ddir) / f"{video_id}.mp4"
            p.write_bytes(b"src")
            return p

        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, generate=gen,
            fetch=fetch, download=AsyncMock(side_effect=_dl),
        )):
            stats = await backfill_clips(MagicMock())

        assert stats.total == 3
        assert stats.generated == 3
        # ONE fetch + ONE download per distinct video, not per lineup.
        assert fetch.await_count == 2
        assert sorted(dl_calls) == ["vidA", "vidB"]
        # Downloaded files cleaned up.
        assert not (tmp_path / "vidA.mp4").exists()
        assert not (tmp_path / "vidB.mp4").exists()

    @pytest.mark.asyncio
    async def test_tally_mixed_outcomes(self, tmp_path: Path):
        lineups = [_lineup("v", 0), _lineup("v", 0), _lineup("v", 0)]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        gen = AsyncMock(side_effect=[
            ClipGenerationResult(status="generated", clip_key="k"),
            ClipGenerationResult(status="skipped", skip_reason="not_a_throw"),
            ClipGenerationResult(status="failed", error_codes=["clip_cut:rc=1"]),
        ])
        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, generate=gen)):
            stats = await backfill_clips(MagicMock())
        assert (stats.generated, stats.skipped, stats.failed) == (1, 1, 1)
        assert any("clip_cut" in e for e in stats.errors)

    @pytest.mark.asyncio
    async def test_metadata_fetch_failure_fails_all_video_lineups(
        self, tmp_path: Path
    ):
        lineups = [_lineup("vbad", 0), _lineup("vbad", 30)]
        fetch = AsyncMock(side_effect=YouTubeFetchError(
            "gone", error_type="ExtractorError", original=Exception()))
        gen = AsyncMock()
        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=[], generate=gen, fetch=fetch)):
            stats = await backfill_clips(MagicMock())
        assert stats.failed == 2
        assert stats.generated == 0
        gen.assert_not_awaited()
        assert any("ExtractorError" in e for e in stats.errors)

    @pytest.mark.asyncio
    async def test_download_failure_fails_all_video_lineups(
        self, tmp_path: Path
    ):
        lineups = [_lineup("vdl", 0)]
        dl = AsyncMock(side_effect=VideoDownloadError(
            "nope", video_id="vdl", error_type="UnavailableVideoError",
            original=Exception()))
        gen = AsyncMock()
        with _enter(_patches(
            tmp_path, lineups=lineups,
            chapters=[Chapter(0, 60, "x")], generate=gen, download=dl)):
            stats = await backfill_clips(MagicMock())
        assert stats.failed == 1
        gen.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_chapter_not_found_is_skipped(self, tmp_path: Path):
        # lineup recorded chapter_start=999 but the video now has only [0,60].
        lineups = [_lineup("v", 999)]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        gen = AsyncMock()
        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, generate=gen)):
            stats = await backfill_clips(MagicMock())
        assert stats.skipped == 1
        gen.assert_not_awaited()
        assert any("chapter not found" in e for e in stats.errors)

    @pytest.mark.asyncio
    async def test_per_lineup_exception_does_not_abort_batch(
        self, tmp_path: Path
    ):
        lineups = [_lineup("v", 0), _lineup("v", 0)]
        chapters = [Chapter(start_seconds=0, end_seconds=60, title="x")]
        gen = AsyncMock(side_effect=[
            RuntimeError("boom"),
            ClipGenerationResult(status="generated", clip_key="k"),
        ])
        with _enter(_patches(
            tmp_path, lineups=lineups, chapters=chapters, generate=gen)):
            stats = await backfill_clips(MagicMock())
        # First raised, second still processed; download cleaned up.
        assert stats.failed == 1
        assert stats.generated == 1
        assert not (tmp_path / "v.mp4").exists()

    @pytest.mark.asyncio
    async def test_cleanup_runs_even_when_all_lineups_raise(
        self, tmp_path: Path
    ):
        lineups = [_lineup("v", 0)]
        gen = AsyncMock(side_effect=RuntimeError("boom"))
        with _enter(_patches(
            tmp_path, lineups=lineups,
            chapters=[Chapter(0, 60, "x")], generate=gen)):
            stats = await backfill_clips(MagicMock())
        assert stats.failed == 1
        assert not (tmp_path / "v.mp4").exists()
