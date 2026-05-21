"""Unit tests for the on-demand widen-source service (PR2 of widen-source).

Per-row sibling of :mod:`test_widen_source_backfill` — same shared helper
under the hood (:func:`cut_and_upload_wide_source`), different orchestration
(one row, HTTP-shaped failures). Asserts the validation guards, the
yt-dlp/ffmpeg failure-to-status mapping, and the download-cleanup invariant.
"""
from __future__ import annotations

import types
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.game.pane_widen_source_service import widen_pane_source
from app.services.ingestion.chapter_parser import Chapter
from app.services.ingestion.wide_source import WideSourceResult
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    YouTubeFetchError,
)

_MOD = "app.services.game.pane_widen_source_service"


def _lineup(
    *,
    video_id: str | None = "vid123",
    chapter_start: int | None = 0,
    clip_url: str | None = "tight.mp4",
    landing_clip_url: str | None = "tight-landing.mp4",
):
    """Lineup stub. Defaults to a row that can be widened on either pane.

    Carries every column LineupRead.model_validate needs (title + status
    are required at the schema level) plus the trim-editor surface
    (``*_url`` / ``*_url_original`` / ``*_trim_*``). All other LineupRead
    fields default to ``None`` and Pydantic accepts that on Optional[..].
    """
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        title="t",
        status="accepted",
        youtube_video_id=video_id,
        chapter_start_seconds=chapter_start,
        chapter_title="B smoke",
        clip_url=clip_url,
        clip_url_original=clip_url,
        clip_trim_start_s=None,
        clip_trim_end_s=None,
        landing_clip_url=landing_clip_url,
        landing_clip_url_original=landing_clip_url,
        landing_clip_trim_start_s=None,
        landing_clip_trim_end_s=None,
        # Other Optional LineupRead fields — Pydantic .model_validate is
        # happy with these being explicit None or missing entirely on a
        # SimpleNamespace, but listing them makes the stub self-documenting.
        stand_screenshot_url=None,
        aim_screenshot_url=None,
        stand_clip_url=None,
        aim_clip_url=None,
        # STAND/AIM shift offsets — PR1 of the shift-window editor (PR #733).
        # _build_admin_read reads these to surface the slider's initial
        # position; default None on the stub mirrors a freshly-ingested row
        # before the operator has shifted the window.
        stand_clip_offset_s=None,
        aim_clip_offset_s=None,
        game_id=None, map_id=None,
        target_zone_id=None, stand_zone_id=None,
        side=None, utility_type_id=None,
        notes=None,
        aim_anchor_x=None, aim_anchor_y=None,
        stand_anchor_x=None, stand_anchor_y=None,
        target_anchor_x=None, target_anchor_y=None,
        setup_seconds=None, technique=None,
        attribution_url=None, attribution_author=None,
        suggested_game_id=None, suggested_map_id=None,
        suggested_target_zone_id=None, suggested_stand_zone_id=None,
        suggested_side=None, suggested_utility_type_id=None,
        classification_confidence=None, classification_reasoning=None,
        target_zone=None, stand_zone=None, utility_type=None,
    )


def _meta():
    m = MagicMock()
    m.description = ""
    m.duration = 120
    m.chapters = [{"start_time": 0, "end_time": 60, "title": "B smoke"}]
    return m


def _wide_ok(source_key="pending/vid123/0-clip-source.mp4"):
    return WideSourceResult(
        source_key=source_key, source_start_s=0.0, source_duration_s=60.0,
    )


def _wide_fail():
    return WideSourceResult(error_codes=["wide_source_cut:rc=1"])


# ---------------------------------------------------------------------------
# Validation guards
# ---------------------------------------------------------------------------


class TestValidation:
    @pytest.mark.asyncio
    async def test_rejects_pane_outside_trimmable_allow_list(self):
        """Stand + aim panes have 1s micro-clips — widen is not meaningful."""
        with pytest.raises(HTTPException) as exc_info:
            await widen_pane_source(MagicMock(), _lineup(), "stand")
        assert exc_info.value.status_code == 400
        assert "cannot be widened" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_404_when_no_youtube_video_id(self):
        """Manual uploads have no YouTube source — can't widen, must Replace."""
        lineup = _lineup(video_id=None)
        with pytest.raises(HTTPException) as exc_info:
            await widen_pane_source(MagicMock(), lineup, "throw")
        assert exc_info.value.status_code == 404
        assert "manual uploads cannot be widened" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_404_when_no_chapter_start_seconds(self):
        """Ingest metadata incomplete — can't locate the chapter to widen."""
        lineup = _lineup(chapter_start=None)
        with pytest.raises(HTTPException) as exc_info:
            await widen_pane_source(MagicMock(), lineup, "throw")
        assert exc_info.value.status_code == 404
        assert "no chapter start" in exc_info.value.detail


# ---------------------------------------------------------------------------
# Failure mapping — yt-dlp / ffmpeg / persist
# ---------------------------------------------------------------------------


def _common_patches(
    *,
    fetch=None,
    download=None,
    wide=None,
    persist=None,
    chapters=None,
):
    """Compose the typical patch stack for widen-source service tests."""
    chapters = chapters or [
        Chapter(start_seconds=0, end_seconds=60, title="B smoke"),
    ]
    return [
        patch(
            f"{_MOD}.fetch_video_detail",
            new=fetch or AsyncMock(return_value=_meta()),
        ),
        patch(f"{_MOD}.parse_chapters", return_value=chapters),
        patch(
            f"{_MOD}.download_video",
            new=download or AsyncMock(return_value=Path("/tmp/x.mp4")),
        ),
        patch(
            f"{_MOD}.cut_and_upload_wide_source",
            new=wide or AsyncMock(return_value=_wide_ok()),
        ),
        patch(
            f"{_MOD}.set_clip_url_original",
            new=persist or AsyncMock(),
        ),
        patch(
            f"{_MOD}.set_landing_clip_url_original",
            new=persist or AsyncMock(),
        ),
        # ``_build_admin_read`` (re-exported via this service) calls
        # ``_sign_screenshot_url`` which hits MinIO. CI doesn't configure
        # MinIO env vars, so we short-circuit signing to return the bare
        # key unchanged. The signing logic has its own dedicated tests in
        # the lineup_service module — covering it here would couple two
        # concerns.
        patch(
            "app.services.game.lineup_service._sign_screenshot_url",
            side_effect=lambda key: key,
        ),
    ]


def _enter(stack):
    import contextlib
    es = contextlib.ExitStack()
    for p in stack:
        es.enter_context(p)
    return es


class TestFailureMapping:
    @pytest.mark.asyncio
    async def test_yt_dlp_metadata_fetch_failure_is_502(self):
        """yt-dlp metadata fetch failure → 502 with the structured error_type."""
        fetch = AsyncMock(side_effect=YouTubeFetchError(
            "gone", error_type="ExtractorError", original=Exception(),
        ))
        with _enter(_common_patches(fetch=fetch)):
            with pytest.raises(HTTPException) as exc_info:
                await widen_pane_source(MagicMock(), _lineup(), "throw")
        assert exc_info.value.status_code == 502
        assert "ExtractorError" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_chapter_not_found_is_404(self):
        """Video chapters shifted since ingest → 404 — recoverable on re-ingest."""
        chapters = [Chapter(start_seconds=999, end_seconds=1050, title="x")]
        with _enter(_common_patches(chapters=chapters)):
            with pytest.raises(HTTPException) as exc_info:
                await widen_pane_source(MagicMock(), _lineup(), "throw")
        assert exc_info.value.status_code == 404
        assert "chapters changed since ingest" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_yt_dlp_download_failure_is_502(self):
        dl = AsyncMock(side_effect=VideoDownloadError(
            "boom", video_id="vid123",
            error_type="UnavailableVideoError", original=Exception(),
        ))
        with _enter(_common_patches(download=dl)):
            with pytest.raises(HTTPException) as exc_info:
                await widen_pane_source(MagicMock(), _lineup(), "throw")
        assert exc_info.value.status_code == 502
        assert "UnavailableVideoError" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_wide_cut_failure_is_500_with_structured_codes(
        self, tmp_path: Path,
    ):
        video_path = tmp_path / "v.mp4"; video_path.write_bytes(b"x")
        wide = AsyncMock(return_value=_wide_fail())
        download = AsyncMock(return_value=video_path)
        with _enter(_common_patches(wide=wide, download=download)):
            with pytest.raises(HTTPException) as exc_info:
                await widen_pane_source(MagicMock(), _lineup(), "throw")
        assert exc_info.value.status_code == 500
        # Structured ffmpeg context propagated.
        assert "wide_source_cut" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_persist_failure_is_500(self, tmp_path: Path):
        video_path = tmp_path / "v.mp4"; video_path.write_bytes(b"x")
        persist = AsyncMock(side_effect=RuntimeError("db down"))
        download = AsyncMock(return_value=video_path)
        with _enter(_common_patches(persist=persist, download=download)):
            with pytest.raises(HTTPException) as exc_info:
                await widen_pane_source(MagicMock(), _lineup(), "throw")
        assert exc_info.value.status_code == 500
        assert "database commit failed" in exc_info.value.detail


# ---------------------------------------------------------------------------
# Happy paths + admin-shape contract
# ---------------------------------------------------------------------------


class TestHappyPath:
    @pytest.mark.asyncio
    async def test_throw_widens_and_returns_admin_shape(self, tmp_path: Path):
        """Widening throw: cut+upload via helper, persist clip_url_original,
        return admin-shape LineupRead with the (signed) original key."""
        video_path = tmp_path / "v.mp4"; video_path.write_bytes(b"x")
        download = AsyncMock(return_value=video_path)
        wide = AsyncMock(return_value=_wide_ok(
            source_key="pending/vid123/0-clip-source.mp4",
        ))
        updated_lineup = _lineup()
        updated_lineup.clip_url_original = "pending/vid123/0-clip-source.mp4"
        persist_throw = AsyncMock(return_value=updated_lineup)
        persist_landing = AsyncMock()

        with _enter([
            patch(f"{_MOD}.fetch_video_detail",
                  new=AsyncMock(return_value=_meta())),
            patch(f"{_MOD}.parse_chapters", return_value=[
                Chapter(start_seconds=0, end_seconds=60, title="x"),
            ]),
            patch(f"{_MOD}.download_video", new=download),
            patch(f"{_MOD}.cut_and_upload_wide_source", new=wide),
            patch(f"{_MOD}.set_clip_url_original", new=persist_throw),
            patch(f"{_MOD}.set_landing_clip_url_original",
                  new=persist_landing),
            # CI has no MinIO env — short-circuit signing.
            patch("app.services.game.lineup_service._sign_screenshot_url",
                  side_effect=lambda key: key),
        ]):
            result = await widen_pane_source(MagicMock(), _lineup(), "throw")

        wide.assert_awaited_once()
        wide_kwargs = wide.await_args.kwargs
        assert wide_kwargs["source_key"] == "pending/vid123/0-clip-source.mp4"
        # Throw persist called; landing persist NOT (independent panes).
        persist_throw.assert_awaited_once()
        persist_landing.assert_not_awaited()
        # Returned shape is the LineupRead with clip_url_original present
        # (admin shape). Signing in _build_admin_read may transform the URL,
        # but the field must be populated (not None).
        assert result.clip_url_original is not None
        # Download was cleaned up.
        assert not video_path.exists()

    @pytest.mark.asyncio
    async def test_landing_widens_via_landing_persist(self, tmp_path: Path):
        """Widening landing routes to the landing repo setter — NOT throw."""
        video_path = tmp_path / "v.mp4"; video_path.write_bytes(b"x")
        download = AsyncMock(return_value=video_path)
        wide = AsyncMock(return_value=_wide_ok(
            source_key="pending/vid123/0-landing-source.mp4",
        ))
        updated_lineup = _lineup()
        updated_lineup.landing_clip_url_original = (
            "pending/vid123/0-landing-source.mp4"
        )
        persist_landing = AsyncMock(return_value=updated_lineup)
        persist_throw = AsyncMock()

        with _enter([
            patch(f"{_MOD}.fetch_video_detail",
                  new=AsyncMock(return_value=_meta())),
            patch(f"{_MOD}.parse_chapters", return_value=[
                Chapter(start_seconds=0, end_seconds=60, title="x"),
            ]),
            patch(f"{_MOD}.download_video", new=download),
            patch(f"{_MOD}.cut_and_upload_wide_source", new=wide),
            patch(f"{_MOD}.set_clip_url_original", new=persist_throw),
            patch(f"{_MOD}.set_landing_clip_url_original", new=persist_landing),
            patch("app.services.game.lineup_service._sign_screenshot_url",
                  side_effect=lambda key: key),
        ]):
            result = await widen_pane_source(MagicMock(), _lineup(), "landing")

        # Landing persist called; throw persist NOT.
        persist_landing.assert_awaited_once()
        persist_throw.assert_not_awaited()
        assert result.landing_clip_url_original is not None
        assert not video_path.exists()

    @pytest.mark.asyncio
    async def test_download_cleaned_up_even_on_persist_failure(
        self, tmp_path: Path,
    ):
        """The downloaded video is unlinked in a finally block — a 500 from
        persist must not leak temp files into ``INGESTION_DOWNLOAD_DIR``."""
        video_path = tmp_path / "v.mp4"; video_path.write_bytes(b"x")
        download = AsyncMock(return_value=video_path)
        persist = AsyncMock(side_effect=RuntimeError("db down"))

        with _enter(_common_patches(download=download, persist=persist)):
            with pytest.raises(HTTPException):
                await widen_pane_source(MagicMock(), _lineup(), "throw")

        # The 500 propagated but the temp file was still cleaned up.
        assert not video_path.exists()

    @pytest.mark.asyncio
    async def test_download_cleaned_up_even_on_wide_failure(
        self, tmp_path: Path,
    ):
        """Same cleanup invariant when the wide cut itself fails."""
        video_path = tmp_path / "v.mp4"; video_path.write_bytes(b"x")
        download = AsyncMock(return_value=video_path)
        wide = AsyncMock(return_value=_wide_fail())

        with _enter(_common_patches(download=download, wide=wide)):
            with pytest.raises(HTTPException):
                await widen_pane_source(MagicMock(), _lineup(), "throw")

        assert not video_path.exists()
