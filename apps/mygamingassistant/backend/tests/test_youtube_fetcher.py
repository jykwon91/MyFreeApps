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
from app.services.ingestion.youtube_fetcher import (
    VideoDownloadError,
    VideoMeta,
    YouTubeFetchError,
    download_video,
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


_FAKE_INFO = {
    "id": "PLtest",
    "title": "Test Playlist",
    "entries": [
        {
            "id": "vid001",
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
            "id": "vid002",
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
        assert videos[0].video_id == "vid001"
        assert videos[0].title == "A-site smokes"
        assert videos[0].duration == 180
        assert videos[0].channel_name == "TestChannel"
        assert len(videos[0].chapters) == 2
        assert videos[1].video_id == "vid002"

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
