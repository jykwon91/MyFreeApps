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
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yt_dlp
import yt_dlp.utils

from app.core.config import settings
from app.models.game.source import Source

logger = logging.getLogger(__name__)

# yt-dlp browsers it knows how to read cookies from. Anything else is
# rejected by the underlying library with a not-very-friendly KeyError, so
# we gate at the boundary instead.
_SUPPORTED_COOKIE_BROWSERS = frozenset(
    {"chrome", "firefox", "edge", "safari", "chromium",
     "opera", "brave", "vivaldi", "whale"}
)


def _apply_cookies_file(opts: dict) -> dict:
    """Inject ``cookiefile`` into a yt-dlp options dict if configured.

    ``YOUTUBE_COOKIES_FILE`` points to a Netscape cookies.txt file exported
    from a logged-in YouTube session (e.g. via the "Get cookies.txt LOCALLY"
    browser extension). When set, yt-dlp reads cookies directly from the file,
    bypassing Chrome's DPAPI encryption entirely — the canonical fix for the
    Chrome 127+ App-Bound Encryption issue that breaks ``cookiesfrombrowser``
    on Windows.

    **Precedence:** when both ``YOUTUBE_COOKIES_FILE`` and
    ``YOUTUBE_COOKIES_FROM_BROWSER`` are set, both options land in *opts* and
    yt-dlp prefers ``cookiefile`` at request time (documented behaviour). The
    browser option is harmless side-cargo and the file wins.

    No-op when the setting is empty. If the path is set but doesn't resolve to
    an existing file, logs a single WARNING and leaves *opts* unchanged — the
    request proceeds without file cookies and will fail loudly with the
    underlying yt-dlp error if no other auth path is available.
    """
    raw = (settings.youtube_cookies_file or "").strip()
    if not raw:
        return opts
    cookie_path = Path(raw)
    if not cookie_path.exists():
        logger.warning(
            "youtube_fetcher: YOUTUBE_COOKIES_FILE=%r does not exist — not "
            "injecting file cookies. Create the file or unset the variable.",
            raw,
        )
        return opts
    opts["cookiefile"] = str(cookie_path)
    return opts


def _apply_browser_cookies(opts: dict) -> dict:
    """Inject ``cookiesfrombrowser`` into a yt-dlp options dict if configured.

    YouTube periodically challenges yt-dlp with "Sign in to confirm you're
    not a bot." The operator-supplied ``YOUTUBE_COOKIES_FROM_BROWSER`` env
    var (resolved into ``settings.youtube_cookies_from_browser``) names a
    browser whose existing session yt-dlp can borrow cookies from to clear
    the challenge — same shape as the ``--cookies-from-browser`` CLI flag.

    No-op (leaves *opts* unchanged) when the setting is empty, which is the
    correct shape for CI and fresh deploys where no local browser exists.
    An unknown browser name is treated as a misconfiguration and logged
    once at WARNING; cookies are NOT injected (the request will still try,
    and either succeed or fail with the underlying yt-dlp error).
    """
    browser = (settings.youtube_cookies_from_browser or "").strip().lower()
    if not browser:
        return opts
    if browser not in _SUPPORTED_COOKIE_BROWSERS:
        logger.warning(
            "youtube_fetcher: YOUTUBE_COOKIES_FROM_BROWSER=%r is not a "
            "yt-dlp-supported browser (supported: %s) — not injecting "
            "cookies. Either correct the setting or unset it.",
            browser, sorted(_SUPPORTED_COOKIE_BROWSERS),
        )
        return opts
    # yt-dlp expects a tuple: (browser, profile?, keyring?, container?).
    # Profile/keyring/container default to None; the single-element tuple
    # is the form mapped from ``--cookies-from-browser <name>``.
    opts["cookiesfrombrowser"] = (browser,)
    return opts


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


# A real YouTube video id is exactly 11 url-safe chars. Channel ids are 24
# chars and start with "UC"; playlist ids start with "PL"/"UU"/etc. Filtering
# on this shape stops a channel/tab id from masquerading as a video id.
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

# yt-dlp tab/segment suffixes that already point at a concrete listing — do
# NOT rewrite these. Everything else that looks like a channel root gets
# "/videos" appended.
_EXPLICIT_TAB_SEGMENTS = frozenset(
    {"videos", "shorts", "streams", "live", "playlists", "playlist", "watch"}
)

# Channel-root forms: youtube.com/@handle, /channel/UC..., /c/Name, /user/Name.
_CHANNEL_ROOT_RE = re.compile(
    r"^(https?://(?:www\.)?youtube\.com/(?:@[^/?#]+|channel/[^/?#]+|c/[^/?#]+|user/[^/?#]+))/?$",
    re.IGNORECASE,
)


def _normalize_listing_url(url: str) -> str:
    """Rewrite a bare channel URL to its /videos tab.

    yt-dlp's ``extract_flat`` on a channel ROOT (``youtube.com/@Handle``)
    returns the channel's *tab playlists* (Videos / Shorts / Live) as entries
    — each carrying the **channel id**, not a video id. Downstream that id is
    fed to ``watch?v=`` and yt-dlp reports "Video unavailable". Targeting the
    ``/videos`` tab makes the single flat extraction return actual videos.

    Playlist URLs (``playlist?list=``), ``watch?v=`` URLs, and channel URLs
    that already name a tab are returned unchanged.
    """
    if "list=" in url or "watch?v=" in url:
        return url
    match = _CHANNEL_ROOT_RE.match(url.strip())
    if not match:
        return url
    return f"{match.group(1)}/videos"


async def list_videos(source: Source) -> list[VideoMeta]:
    """Return new video metadata for a Source without downloading anything.

    Uses yt-dlp's extract_flat mode so only metadata is fetched, not the
    actual video stream. This is fast enough to run synchronously in a thread.

    Per check-third-party-error-codes: yt-dlp DownloadError / ExtractorError
    exceptions are caught, logged at ERROR with structured context, and
    re-raised as YouTubeFetchError.
    """
    raw_url = _source_url(source)
    if not raw_url:
        raise YouTubeFetchError(
            f"Source {source.id} has no URL in config_json",
            error_type="MissingURL",
            original=ValueError("missing URL"),
        )
    # A bare channel URL flattens to tab-playlists, not videos — rewrite to
    # the /videos tab so the flat extraction returns actual videos.
    url = _normalize_listing_url(raw_url)

    ydl_opts = _apply_cookies_file(_apply_browser_cookies({
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "skip_download": True,
        "ignoreerrors": False,
    }))

    def _fetch() -> list[VideoMeta]:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
        if info is None:
            return []

        # A channel can flatten to a playlist-of-playlists (the Videos/Shorts/
        # Live tabs). Descend into any nested "entries" so we always end up at
        # leaf video entries. A node with no "entries" key at all is the
        # single watch?v= case — treat it as one leaf.
        def _iter_leaf_entries(node: dict):
            nested = node.get("entries")
            if nested is None:
                yield node
                return
            for child in nested:
                if child is not None:
                    yield from _iter_leaf_entries(child)

        results: list[VideoMeta] = []
        seen: set[str] = set()
        for entry in _iter_leaf_entries(info):
            if entry.get("_type") == "playlist":
                continue
            vid_id = entry.get("id") or entry.get("url", "").split("v=")[-1]
            # Reject anything that isn't a real 11-char video id — a channel
            # id (UC…, 24 chars) or playlist id slipping through here is the
            # exact bug that made channel syncs produce 0 lineups.
            if not vid_id or not _VIDEO_ID_RE.match(vid_id):
                continue
            if vid_id in seen:
                continue
            seen.add(vid_id)
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
    ydl_opts = _apply_cookies_file(_apply_browser_cookies({
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "ignoreerrors": False,
    }))

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

    ydl_opts = _apply_cookies_file(_apply_browser_cookies({
        "quiet": True,
        "no_warnings": True,
        "outtmpl": output_template,
        # Permissive format selector: let yt-dlp pick best video+audio from any
        # codec — merge_output_format=mp4 below coerces the merged file to mp4
        # regardless of source codecs. The old ext=mp4 filter excluded webm/vp9
        # streams, which is all YouTube hands to anonymous/non-Premium sessions.
        "format": "bestvideo*+bestaudio/best",
        "merge_output_format": "mp4",
        "ignoreerrors": False,
    }))

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
