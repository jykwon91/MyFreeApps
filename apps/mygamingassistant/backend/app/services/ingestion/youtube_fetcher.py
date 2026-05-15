"""YouTube fetcher — list video metadata and download video files via yt-dlp.

Per rules/check-third-party-error-codes.md: yt-dlp raises structured exception
types. All failure paths capture and log the exception class name and message at
ERROR level, then surface the error to Sentry. Callers receive typed results
rather than bare booleans.

Usage::

    from app.services.ingestion.youtube_fetcher import list_videos, download_video, VideoMeta
    from app.models.game.source import Source

    videos = await list_videos(source)
    path = await download_video("dQw4w9WgXcQ", download_dir=Path("/tmp/mga-ingestion"))
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yt_dlp
import yt_dlp.utils

from app.models.game.source import Source

logger = logging.getLogger(__name__)


@dataclass
class VideoMeta:
    """Metadata for a single YouTube video."""
    video_id: str
    title: str
    description: str
    duration: int
    published_at: Optional[str]
    channel_name: Optional[str]
    url: str
    # Native chapters from yt-dlp (preferred over description regex).
    # Each dict has "start_time", "end_time", "title" keys.
    chapters: list[dict] = field(default_factory=list)


class YouTubeFetchError(Exception):
    """Raised when yt-dlp fails to fetch video/playlist metadata.

    Attributes:
        error_type: yt-dlp exception class name (e.g. "ExtractorError").
        original: The original yt-dlp exception for callers that need it.
    """
    def __init__(self, message: str, *, error_type: str, original: Exception) -> None:
        super().__init__(message)
        self.error_type = error_type
        self.original = original


class VideoDownloadError(Exception):
    """Raised when a video download fails.

    Attributes:
        video_id: The YouTube video ID that failed.
        error_type: yt-dlp exception class name.
    """
    def __init__(self, message: str, *, video_id: str, error_type: str, original: Exception) -> None:
        super().__init__(message)
        self.video_id = video_id
        self.error_type = error_type
        self.original = original


def _source_url(source: Source) -> str:
    """Extract the target URL from a Source's config_json."""
    cfg = source.config_json or {}
    # Support both "url" (playlist) and "channel_url" (channel) keys per the model docstring.
    return cfg.get("url") or cfg.get("channel_url") or ""


async def list_videos(source: Source) -> list[VideoMeta]:
    """Return new video metadata for a Source without downloading anything.

    Uses yt-dlp's extract_flat mode so only metadata is fetched, not the
    actual video stream. This is fast enough to run synchronously in a thread.

    Per check-third-party-error-codes: yt-dlp DownloadError / ExtractorError
    exceptions are caught, logged at ERROR with structured context, and
    re-raised as YouTubeFetchError.
    """
    url = _source_url(source)
    if not url:
        raise YouTubeFetchError(
            f"Source {source.id} has no URL in config_json",
            error_type="MissingURL",
            original=ValueError("missing URL"),
        )

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "skip_download": True,
        "ignoreerrors": False,
    }

    def _fetch() -> list[VideoMeta]:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if info is None:
            return []

        entries = info.get("entries") or []
        # Single video (not a playlist/channel) — wrap in a list.
        # Only treat the root info as a video if it has no "entries" key at all
        # (a playlist with 0 entries still has entries=[]).
        if "entries" not in info and info.get("id"):
            entries = [info]

        results: list[VideoMeta] = []
        for entry in entries:
            vid_id = entry.get("id") or entry.get("url", "").split("v=")[-1]
            if not vid_id:
                continue
            results.append(
                VideoMeta(
                    video_id=vid_id,
                    title=entry.get("title") or "",
                    description=entry.get("description") or "",
                    duration=int(entry.get("duration") or 0),
                    published_at=entry.get("upload_date"),
                    channel_name=entry.get("channel") or entry.get("uploader"),
                    url=f"https://www.youtube.com/watch?v={vid_id}",
                    chapters=entry.get("chapters") or [],
                )
            )
        return results

    try:
        return await asyncio.get_event_loop().run_in_executor(None, _fetch)
    except yt_dlp.utils.DownloadError as exc:
        error_type = type(exc).__name__
        logger.error(
            "yt-dlp DownloadError listing source=%s url=%s error_type=%s message=%s",
            source.id, url, error_type, str(exc),
            exc_info=True,
        )
        raise YouTubeFetchError(
            f"Failed to list videos for source {source.id}: {exc}",
            error_type=error_type,
            original=exc,
        ) from exc
    except yt_dlp.utils.ExtractorError as exc:
        error_type = type(exc).__name__
        logger.error(
            "yt-dlp ExtractorError listing source=%s url=%s error_type=%s message=%s",
            source.id, url, error_type, str(exc),
            exc_info=True,
        )
        raise YouTubeFetchError(
            f"Failed to list videos for source {source.id}: {exc}",
            error_type=error_type,
            original=exc,
        ) from exc
    except Exception as exc:
        error_type = type(exc).__name__
        logger.error(
            "Unexpected error listing source=%s url=%s error_type=%s",
            source.id, url, error_type,
            exc_info=True,
        )
        raise YouTubeFetchError(
            f"Unexpected error listing videos for source {source.id}: {exc}",
            error_type=error_type,
            original=exc,
        ) from exc


async def fetch_video_detail(video_id: str) -> VideoMeta:
    """Full per-video metadata extract (NOT extract_flat).

    ``list_videos`` uses ``extract_flat`` for fast channel/playlist enumeration,
    so flat entries carry only id/title/url — no description, duration, or
    chapters. Chapter parsing needs the full info dict, so the orchestrator
    calls this for each new (post-dedup) video before parsing chapters.

    Per check-third-party-error-codes: yt-dlp DownloadError / ExtractorError
    are caught, logged at ERROR with structured context, and re-raised as
    YouTubeFetchError.
    """
    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "ignoreerrors": False,
    }

    def _fetch() -> VideoMeta:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if info is None:
            raise YouTubeFetchError(
                f"yt-dlp returned no info for video {video_id}",
                error_type="EmptyInfo",
                original=ValueError("empty info"),
            )
        return VideoMeta(
            video_id=info.get("id") or video_id,
            title=info.get("title") or "",
            description=info.get("description") or "",
            duration=int(info.get("duration") or 0),
            published_at=info.get("upload_date"),
            channel_name=info.get("channel") or info.get("uploader"),
            url=f"https://www.youtube.com/watch?v={video_id}",
            chapters=info.get("chapters") or [],
        )

    try:
        return await asyncio.get_event_loop().run_in_executor(None, _fetch)
    except yt_dlp.utils.DownloadError as exc:
        error_type = type(exc).__name__
        logger.error(
            "yt-dlp DownloadError fetching detail video_id=%s error_type=%s message=%s",
            video_id, error_type, str(exc),
            exc_info=True,
        )
        raise YouTubeFetchError(
            f"Failed to fetch detail for video {video_id}: {exc}",
            error_type=error_type,
            original=exc,
        ) from exc
    except yt_dlp.utils.ExtractorError as exc:
        error_type = type(exc).__name__
        logger.error(
            "yt-dlp ExtractorError fetching detail video_id=%s error_type=%s message=%s",
            video_id, error_type, str(exc),
            exc_info=True,
        )
        raise YouTubeFetchError(
            f"Failed to fetch detail for video {video_id}: {exc}",
            error_type=error_type,
            original=exc,
        ) from exc
    except Exception as exc:
        error_type = type(exc).__name__
        logger.error(
            "Unexpected error fetching detail video_id=%s error_type=%s",
            video_id, error_type,
            exc_info=True,
        )
        raise YouTubeFetchError(
            f"Unexpected error fetching detail for video {video_id}: {exc}",
            error_type=error_type,
            original=exc,
        ) from exc


async def download_video(video_id: str, download_dir: Path) -> Path:
    """Download a YouTube video to ``download_dir/{video_id}.mp4``.

    Returns the Path to the downloaded file. Caller is responsible for
    cleanup (ingestion_orchestrator deletes after frame extraction).

    Per check-third-party-error-codes: DownloadError / UnavailableVideoError
    are caught, logged at ERROR with structured context, re-raised as
    VideoDownloadError.
    """
    download_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(download_dir / f"{video_id}.%(ext)s")

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "outtmpl": output_template,
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "ignoreerrors": False,
    }

    def _download() -> Path:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
        # The file will be named {video_id}.mp4 after merge.
        target = download_dir / f"{video_id}.mp4"
        if not target.exists():
            # yt-dlp might have used a different extension; search for it.
            candidates = list(download_dir.glob(f"{video_id}.*"))
            if not candidates:
                raise FileNotFoundError(f"Download completed but file not found: {target}")
            target = candidates[0]
        return target

    try:
        return await asyncio.get_event_loop().run_in_executor(None, _download)
    except yt_dlp.utils.DownloadError as exc:
        error_type = type(exc).__name__
        logger.error(
            "yt-dlp DownloadError downloading video_id=%s error_type=%s message=%s",
            video_id, error_type, str(exc),
            exc_info=True,
        )
        raise VideoDownloadError(
            f"Failed to download video {video_id}: {exc}",
            video_id=video_id,
            error_type=error_type,
            original=exc,
        ) from exc
    except Exception as exc:
        error_type = type(exc).__name__
        logger.error(
            "Unexpected error downloading video_id=%s error_type=%s",
            video_id, error_type,
            exc_info=True,
        )
        raise VideoDownloadError(
            f"Unexpected error downloading video {video_id}: {exc}",
            video_id=video_id,
            error_type=error_type,
            original=exc,
        ) from exc
