"""Chapter parser — extract chapter timestamps from YouTube video descriptions.

Priority order:
  1. yt-dlp's native chapter extraction (`info_dict["chapters"]`) — used when available.
  2. Regex-based description parsing — fallback when native chapters are absent.

A valid chapter list requires at least 2 entries with monotonically increasing
timestamps. Single-timestamp descriptions are NOT treated as chapters.

Usage::

    from app.services.ingestion.chapter_parser import parse_chapters, Chapter

    chapters = parse_chapters(description="0:00 Intro\\n1:30 A-site smoke", video_duration=300)
    # or pass native chapters from yt-dlp:
    chapters = parse_chapters(
        description="...",
        video_duration=300,
        native_chapters=[{"start_time": 0, "end_time": 90, "title": "Intro"}, ...],
    )
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Chapter:
    start_seconds: int
    end_seconds: int
    title: str


_TIMESTAMP_RE = re.compile(
    r"^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.+?)\s*$",
    re.MULTILINE,
)


def _parse_timestamp(hours: Optional[str], minutes: str, seconds: str) -> int:
    """Convert regex match groups to an integer second offset."""
    h = int(hours) if hours else 0
    m = int(minutes)
    s = int(seconds)
    return h * 3600 + m * 60 + s


def _parse_chapters_from_description(
    description: str,
    video_duration: int,
) -> list[Chapter]:
    """Extract chapters from a raw video description using regex.

    Rules:
      - A line is a chapter if it matches ``HH:MM:SS Title`` or ``MM:SS Title``.
      - Timestamps must be monotonically increasing.
      - At least 2 valid chapter lines required; otherwise returns [].
      - The last chapter's end_seconds is capped at video_duration.
    """
    candidates: list[tuple[int, str]] = []

    for match in _TIMESTAMP_RE.finditer(description):
        hours, minutes, seconds, title = match.groups()
        try:
            offset = _parse_timestamp(hours, minutes, seconds)
        except (ValueError, TypeError):
            continue
        # Enforce monotonically increasing timestamps.
        if candidates and offset <= candidates[-1][0]:
            continue
        candidates.append((offset, title.strip()))

    if len(candidates) < 2:
        return []

    chapters: list[Chapter] = []
    for i, (start, title) in enumerate(candidates):
        if i + 1 < len(candidates):
            end = candidates[i + 1][0]
        else:
            end = video_duration
        chapters.append(Chapter(start_seconds=start, end_seconds=end, title=title))

    return chapters


def parse_chapters(
    description: str,
    video_duration: int,
    native_chapters: Optional[list[dict]] = None,
) -> list[Chapter]:
    """Return the chapter list for a video.

    Prefers yt-dlp's native chapter extraction (``native_chapters``) because it
    handles edge cases better than regex. Falls back to description parsing when
    native chapters are absent or empty.

    Args:
        description: Raw video description text from yt-dlp info_dict.
        video_duration: Video duration in seconds (from yt-dlp info_dict["duration"]).
        native_chapters: Optional list of chapter dicts from yt-dlp
            info_dict.get("chapters"). Each dict has "start_time", "end_time",
            "title" keys. Pass None or [] to force description-regex fallback.

    Returns:
        List of Chapter objects, empty if no valid chapters found.
    """
    # Prefer native chapters from yt-dlp — they're more reliable than regex.
    if native_chapters:
        result: list[Chapter] = []
        for ch in native_chapters:
            try:
                start = int(ch.get("start_time", 0))
                end = int(ch.get("end_time", video_duration))
                title = str(ch.get("title", "")).strip()
                if title:
                    result.append(Chapter(start_seconds=start, end_seconds=end, title=title))
            except (ValueError, TypeError, KeyError):
                continue
        if result:
            return result

    # Fallback to description regex.
    return _parse_chapters_from_description(description, video_duration)
