"""Unit tests for youtube_fetcher — all yt-dlp calls are mocked (no real network).

Tests verify:
- list_videos returns VideoMeta list for a playlist
- list_videos raises YouTubeFetchError on yt-dlp DownloadError
- list_videos raises YouTubeFetchError on yt-dlp ExtractorError
- download_video returns Path on success
- download_video raises VideoDownloadError on yt-dlp DownloadError
- Error codes / types are captured in the exception
"""
from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import yt_dlp.utils

from app.models.game.source import Source
from app.core.config import settings
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    VideoMeta,
    YouTubeFetchError,
    _apply_browser_cookies,
    download_video,
    fetch_video_detail,
    list_videos,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_source(kind: str = "youtube_playlist", url: str = "https://www.youtube.com/playlist?list=PLtest") -> Source:
    return Source(
        id=uuid.uuid4(),
        kind=kind,
        config_json={"url": url},
    )


def _make_channel_source(url: str = "https://www.youtube.com/@testchannel") -> Source:
    return Source(
        id=uuid.uuid4(),
        kind="youtube_channel",
        config_json={"channel_url": url},
    )


# Video ids MUST be realistic 11-char YouTube ids — list_videos rejects
# anything that isn't, so a channel/tab id can never masquerade as a video.
_FAKE_INFO = {
    "id": "PLtest",
    "title": "Test Playlist",
    "entries": [
        {
            "id": "vid00000001",
            "title": "A-site smokes",
            "description": "0:00 Intro\n1:00 A-site smoke from CT",
            "duration": 180,
            "upload_date": "20260101",
            "channel": "TestChannel",
            "chapters": [
                {"start_time": 0, "end_time": 60, "title": "Intro"},
                {"start_time": 60, "end_time": 180, "title": "A-site smoke from CT"},
            ],
        },
        {
            "id": "vid00000002",
            "title": "B-site post-plant",
            "description": "0:00 B-site smoke",
            "duration": 90,
            "upload_date": "20260102",
            "channel": "TestChannel",
            "chapters": [],
        },
    ],
}


# ---------------------------------------------------------------------------
# list_videos
# ---------------------------------------------------------------------------

class TestListVideos:
    @pytest.mark.asyncio
    async def test_returns_video_meta_list(self):
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.extract_info = MagicMock(return_value=_FAKE_INFO)

        source = _make_source()
        with patch("yt_dlp.YoutubeDL", return_value=mock_ydl):
            videos = await list_videos(source)

        assert len(videos) == 2
        assert videos[0].video_id == "vid00000001"
        assert videos[0].title == "A-site smokes"
        assert videos[0].duration == 180
        assert videos[0].channel_name == "TestChannel"
        assert len(videos[0].chapters) == 2
        assert videos[1].video_id == "vid00000002"

    @pytest.mark.asyncio
    async def test_raises_on_download_error(self):
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.extract_info = MagicMock(
            side_effect=yt_dlp.utils.DownloadError("Video unavailable")
        )

        source = _make_source()
        with patch("yt_dlp.YoutubeDL", return_value=mock_ydl):
            with pytest.raises(YouTubeFetchError) as exc_info:
                await list_videos(source)

        err = exc_info.value
        assert "DownloadError" in err.error_type
        assert isinstance(err.original, yt_dlp.utils.DownloadError)

    @pytest.mark.asyncio
    async def test_raises_on_extractor_error(self):
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.extract_info = MagicMock(
            side_effect=yt_dlp.utils.ExtractorError("Extractor failed")
        )

        source = _make_source()
        with patch("yt_dlp.YoutubeDL", return_value=mock_ydl):
            with pytest.raises(YouTubeFetchError) as exc_info:
                await list_videos(source)

        err = exc_info.value
        assert "ExtractorError" in err.error_type

    @pytest.mark.asyncio
    async def test_missing_url_raises(self):
        source = Source(id=uuid.uuid4(), kind="youtube_playlist", config_json={})
        with pytest.raises(YouTubeFetchError) as exc_info:
            await list_videos(source)
        assert "MissingURL" in exc_info.value.error_type

    @pytest.mark.asyncio
    async def test_returns_empty_for_empty_playlist(self):
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.extract_info = MagicMock(return_value={"id": "PLempty", "entries": []})

        source = _make_source()
        with patch("yt_dlp.YoutubeDL", return_value=mock_ydl):
            videos = await list_videos(source)

        assert videos == []

    @pytest.mark.asyncio
    async def test_channel_url_from_channel_url_key(self):
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.extract_info = MagicMock(return_value={"entries": [], "id": "test"})

        source = _make_channel_source()
        with patch("yt_dlp.YoutubeDL", return_value=mock_ydl):
            videos = await list_videos(source)
        # Successful call with channel_url source — no error
        assert isinstance(videos, list)


# ---------------------------------------------------------------------------
# Channel-URL normalization + tab-id rejection
#
# Regression guard for the bug where syncing a channel produced 0 lineups:
# a bare channel URL flattens to its Videos/Shorts/Live TAB playlists, each
# carrying the 24-char channel id (not a video id). That id was fed to
# watch?v= -> "Video unavailable" -> error_count=N, video_count=0.
# ---------------------------------------------------------------------------

from app.services.ingestion.youtube_fetcher import _normalize_listing_url  # noqa: E402


class TestChannelUrlNormalization:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("https://www.youtube.com/@TigerrGG", "https://www.youtube.com/@TigerrGG/videos"),
            ("https://www.youtube.com/@TigerrGG/", "https://www.youtube.com/@TigerrGG/videos"),
            ("https://youtube.com/channel/UCabcdefghijklmnopqrstuv",
             "https://youtube.com/channel/UCabcdefghijklmnopqrstuv/videos"),
            ("https://www.youtube.com/c/SomeName", "https://www.youtube.com/c/SomeName/videos"),
            ("https://www.youtube.com/user/OldStyle", "https://www.youtube.com/user/OldStyle/videos"),
            # Already-explicit / non-channel URLs are left untouched.
            ("https://www.youtube.com/@TigerrGG/videos", "https://www.youtube.com/@TigerrGG/videos"),
            ("https://www.youtube.com/@TigerrGG/shorts", "https://www.youtube.com/@TigerrGG/shorts"),
            ("https://www.youtube.com/playlist?list=PLabc", "https://www.youtube.com/playlist?list=PLabc"),
            ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
        ],
    )
    def test_normalization(self, raw: str, expected: str):
        assert _normalize_listing_url(raw) == expected

    @pytest.mark.asyncio
    async def test_channel_tab_ids_are_rejected(self):
        """yt-dlp flattening a channel yields tab-playlists carrying the
        24-char channel id. None of them may become a VideoMeta."""
        channel_tabs_info = {
            "id": "UCX_C4FYHUIYPpLTCmJ5VVYA",
            "title": "Tigerr",
            "entries": [
                {"id": "UCX_C4FYHUIYPpLTCmJ5VVYA", "title": "Tigerr - Videos", "_type": "playlist"},
                {"id": "UCX_C4FYHUIYPpLTCmJ5VVYA", "title": "Tigerr - Shorts", "_type": "playlist"},
                {"id": "UCX_C4FYHUIYPpLTCmJ5VVYA", "title": "Tigerr - Live"},
            ],
        }
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.extract_info = MagicMock(return_value=channel_tabs_info)

        with patch("yt_dlp.YoutubeDL", return_value=mock_ydl):
            videos = await list_videos(_make_channel_source())

        assert videos == []

    @pytest.mark.asyncio
    async def test_nested_playlist_entries_are_flattened(self):
        """A playlist-of-playlists is descended to leaf video entries; only
        valid 11-char ids survive."""
        nested_info = {
            "id": "UCsomechannelid000000001",
            "entries": [
                {
                    "id": "UCsomechannelid000000001",
                    "title": "Videos tab",
                    "entries": [
                        {"id": "realvideo01", "title": "Lineup 1", "duration": 100},
                        {"id": "realvideo02", "title": "Lineup 2", "duration": 120},
                        {"id": "PLnotavideoplaylist", "title": "nested playlist ref"},
                    ],
                },
            ],
        }
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.extract_info = MagicMock(return_value=nested_info)

        with patch("yt_dlp.YoutubeDL", return_value=mock_ydl):
            videos = await list_videos(_make_channel_source())

        assert [v.video_id for v in videos] == ["realvideo01", "realvideo02"]


# ---------------------------------------------------------------------------
# fetch_video_detail — full per-video extract (NOT extract_flat)
# ---------------------------------------------------------------------------

class TestFetchVideoDetail:
    @pytest.mark.asyncio
    async def test_returns_full_metadata_with_chapters(self):
        """A full extract_info dict yields description + native chapters,
        which list_videos' extract_flat entries never carry."""
        full_info = {
            "id": "vid777",
            "title": "Mirage A-site executes",
            "description": "0:00 Intro\n0:30 Stack smoke",
            "duration": 240,
            "upload_date": "20260201",
            "channel": "ProCreator",
            "chapters": [
                {"start_time": 0, "end_time": 30, "title": "Intro"},
                {"start_time": 30, "end_time": 240, "title": "Stack smoke"},
            ],
        }
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.extract_info = MagicMock(return_value=full_info)

        with patch("yt_dlp.YoutubeDL", return_value=mock_ydl):
            meta = await fetch_video_detail("vid777")

        assert meta.video_id == "vid777"
        assert meta.description == "0:00 Intro\n0:30 Stack smoke"
        assert meta.duration == 240
        assert meta.channel_name == "ProCreator"
        assert len(meta.chapters) == 2

    @pytest.mark.asyncio
    async def test_raises_on_download_error(self):
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.extract_info = MagicMock(
            side_effect=yt_dlp.utils.DownloadError("Video unavailable")
        )

        with patch("yt_dlp.YoutubeDL", return_value=mock_ydl):
            with pytest.raises(YouTubeFetchError) as exc_info:
                await fetch_video_detail("vidGone")

        assert "DownloadError" in exc_info.value.error_type


# ---------------------------------------------------------------------------
# download_video
# ---------------------------------------------------------------------------

class TestDownloadVideo:
    @pytest.mark.asyncio
    async def test_returns_path_on_success(self, tmp_path: Path):
        # Create the expected output file so the path-check passes.
        expected = tmp_path / "vid001.mp4"
        expected.write_bytes(b"fake video data")

        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.download = MagicMock(return_value=None)

        with patch("yt_dlp.YoutubeDL", return_value=mock_ydl):
            result = await download_video("vid001", download_dir=tmp_path)

        assert result == expected

    @pytest.mark.asyncio
    async def test_raises_video_download_error_on_failure(self, tmp_path: Path):
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.download = MagicMock(
            side_effect=yt_dlp.utils.DownloadError("Private video")
        )

        with patch("yt_dlp.YoutubeDL", return_value=mock_ydl):
            with pytest.raises(VideoDownloadError) as exc_info:
                await download_video("vidPrivate", download_dir=tmp_path)

        err = exc_info.value
        assert err.video_id == "vidPrivate"
        assert "DownloadError" in err.error_type
        assert isinstance(err.original, yt_dlp.utils.DownloadError)


# ---------------------------------------------------------------------------
# Browser-cookies helper + wire-up
#
# YOUTUBE_COOKIES_FROM_BROWSER lets the operator bypass YouTube's
# "Sign in to confirm you're not a bot" challenge by reusing an
# already-authenticated browser session. The helper is a no-op when unset
# (the right shape for CI / fresh deploys). The wire-up tests below are
# regression guards: if a future refactor drops the _apply_browser_cookies
# call from any of the three yt-dlp option dicts, the feature silently
# degrades — no symptom until YouTube next throws the bot challenge.
# ---------------------------------------------------------------------------

class TestApplyBrowserCookies:
    def test_empty_setting_is_noop(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "youtube_cookies_from_browser", "")
        opts = {"quiet": True}
        out = _apply_browser_cookies(opts)
        assert "cookiesfrombrowser" not in out
        assert out is opts  # same dict, no defensive copy

    def test_valid_browser_injects_tuple(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "youtube_cookies_from_browser", "chrome")
        out = _apply_browser_cookies({"quiet": True})
        assert out["cookiesfrombrowser"] == ("chrome",)

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Chrome", "chrome"),
            ("  firefox  ", "firefox"),
            ("EDGE", "edge"),
            ("Brave", "brave"),
        ],
    )
    def test_case_and_whitespace_normalized(
        self, monkeypatch: pytest.MonkeyPatch, raw: str, expected: str
    ):
        monkeypatch.setattr(settings, "youtube_cookies_from_browser", raw)
        out = _apply_browser_cookies({})
        assert out["cookiesfrombrowser"] == (expected,)

    def test_unsupported_browser_is_noop_with_warning(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ):
        import logging
        monkeypatch.setattr(settings, "youtube_cookies_from_browser", "internet-explorer")
        with caplog.at_level(logging.WARNING, logger="app.services.ingestion.youtube_fetcher"):
            out = _apply_browser_cookies({"quiet": True})
        assert "cookiesfrombrowser" not in out
        assert any("internet-explorer" in r.message for r in caplog.records)

    @pytest.mark.parametrize("browser", ["chrome", "firefox", "edge", "safari",
                                          "chromium", "opera", "brave", "vivaldi", "whale"])
    def test_all_supported_browsers_accepted(
        self, monkeypatch: pytest.MonkeyPatch, browser: str
    ):
        monkeypatch.setattr(settings, "youtube_cookies_from_browser", browser)
        out = _apply_browser_cookies({})
        assert out["cookiesfrombrowser"] == (browser,)


class TestCookiesWireUp:
    """Each yt-dlp call site MUST pass its options dict through
    _apply_browser_cookies. These tests fail if a future refactor drops
    the wrapper from any one of them."""

    @pytest.mark.asyncio
    async def test_list_videos_passes_cookies(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "youtube_cookies_from_browser", "firefox")
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.extract_info = MagicMock(return_value={"id": "PLempty", "entries": []})

        constructor = MagicMock(return_value=mock_ydl)
        with patch("yt_dlp.YoutubeDL", constructor):
            await list_videos(_make_source())

        passed_opts = constructor.call_args.args[0]
        assert passed_opts.get("cookiesfrombrowser") == ("firefox",)

    @pytest.mark.asyncio
    async def test_fetch_video_detail_passes_cookies(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "youtube_cookies_from_browser", "edge")
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.extract_info = MagicMock(return_value={
            "id": "vid000", "title": "x", "duration": 1, "upload_date": "20260101",
            "channel": "c", "description": "", "chapters": [],
        })

        constructor = MagicMock(return_value=mock_ydl)
        with patch("yt_dlp.YoutubeDL", constructor):
            await fetch_video_detail("vid000")

        passed_opts = constructor.call_args.args[0]
        assert passed_opts.get("cookiesfrombrowser") == ("edge",)

    @pytest.mark.asyncio
    async def test_download_video_passes_cookies(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ):
        monkeypatch.setattr(settings, "youtube_cookies_from_browser", "brave")
        (tmp_path / "vid001.mp4").write_bytes(b"x")
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.download = MagicMock(return_value=None)

        constructor = MagicMock(return_value=mock_ydl)
        with patch("yt_dlp.YoutubeDL", constructor):
            await download_video("vid001", download_dir=tmp_path)

        passed_opts = constructor.call_args.args[0]
        assert passed_opts.get("cookiesfrombrowser") == ("brave",)

    @pytest.mark.asyncio
    async def test_no_cookies_key_when_setting_empty(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        """The default shape (empty setting) must NOT add cookiesfrombrowser
        to the opts — yt-dlp on CI / fresh deploys has no browser to read."""
        monkeypatch.setattr(settings, "youtube_cookies_from_browser", "")
        mock_ydl = MagicMock()
        mock_ydl.__enter__ = MagicMock(return_value=mock_ydl)
        mock_ydl.__exit__ = MagicMock(return_value=False)
        mock_ydl.extract_info = MagicMock(return_value={"id": "PLempty", "entries": []})

        constructor = MagicMock(return_value=mock_ydl)
        with patch("yt_dlp.YoutubeDL", constructor):
            await list_videos(_make_source())

        assert "cookiesfrombrowser" not in constructor.call_args.args[0]
