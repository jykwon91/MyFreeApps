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
from dataclasses import dataclass, replace
from statistics import median
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


# Chapter titles that are video *structure*, not lineup demonstrations. A
# YouTube lineup tutorial interleaves real lineup chapters ("A smoke from T
# spawn") with structural chapters (intro, outro, "Tip 3", "Subscribe"). The
# structural ones become useless pending lineup rows AND waste a classifier
# call, so drop them before ingestion. Matched case-insensitively, anchored to
# the start of the stripped title so "Mid smoke (intro angle)" is NOT dropped.
#
# Phase-1 cheap win. Phase 2 (Strategy A: multi-frame extraction + a Claude
# `is_lineup` decision) makes the classifier itself the lineup detector and
# supersedes this title heuristic.
_NON_LINEUP_TITLE_RE = re.compile(
    r"^\s*(?:"
    r"intro|outro|tips?|"
    r"subscribe|like|smash|"
    r"thanks|thank\s*you|thx|"
    r"conclusion|summary|recap|wrap[\s-]?up|overview|"
    r"sponsor|promo|shout[\s-]?out|"
    r"credits|disclaimer|patreon|discord|socials?|links?|"
    r"giveaway|announcement|update|news|donate|donation|"
    r"the\s+end|bye|see\s*you"
    r")\b",
    re.IGNORECASE,
)

# Whole-video *framing* titles — a creator's video-level name, not an
# individual lineup demonstration. These routinely appear as the 0:00 chapter
# (YouTube seeds the first chapter with the video title) and on standalone
# promo / title cards. Suffix-anchored on the framing noun so a real lineup
# whose title merely contains the word mid-string ("Smoke guide line on B") is
# NOT dropped. Added 2026-05-28 after "Best Anubis Smokes Guide" — the video's
# own title reused as a 0:00 intro-card chapter — slipped past the
# prefix-anchored denylist above and became a junk accepted lineup.
_VIDEO_FRAMING_SUFFIX_RE = re.compile(
    r"\b(?:guide|guides|tutorial|tutorials|walkthrough|walkthroughs|"
    r"compilation|montage|breakdown|masterclass)\s*$",
    re.IGNORECASE,
)

# Minimum chapter length for a plausible lineup demo. A real lineup
# demonstration (walk to spot, line up the throw, throw, show result) is rarely
# shorter than this; sub-15s chapters are almost always transitions/stings.
_MIN_LINEUP_CHAPTER_SECONDS = 15


def _normalize_title(title: str) -> str:
    """Lowercase + collapse to space-separated alnum tokens for comparison."""
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def _is_video_title_intro(chapter: Chapter, video_title: Optional[str]) -> bool:
    """True when *chapter* is the 0:00 chapter whose title IS the video title.

    YouTube seeds the first chapter with the video's own name. When a creator
    opens with a promo / title card (rather than launching straight into a
    lineup), that 0:00 chapter is the whole-video framing, not a lineup — e.g.
    a chapter "Best Anubis Smokes Guide" on a video of the same name.

    Matching the video title (exact, or a >=60%-length prefix to tolerate
    " | Channel" / " (CS2)" suffixes YouTube appends to the *video* title) is a
    near-zero-false-positive signal: a genuine lineup chapter is never titled
    identically to the whole video. The 60% length guard protects a short real
    first-lineup title that merely prefixes the video title ("A Site" on
    "A Site Smokes").
    """
    if not video_title or chapter.start_seconds != 0:
        return False
    nt = _normalize_title(chapter.title)
    nv = _normalize_title(video_title)
    if not nt or not nv:
        return False
    if nt == nv:
        return True
    return nv.startswith(nt) and len(nt) >= 0.6 * len(nv)


def filter_lineup_chapters(
    chapters: list[Chapter],
    *,
    min_duration_seconds: int = _MIN_LINEUP_CHAPTER_SECONDS,
    video_title: Optional[str] = None,
) -> list[Chapter]:
    """Drop chapters that are video structure, not lineup demonstrations.

    Four heuristics applied *after* ``parse_chapters``:

      1. **Title denylist** — intro / outro / "tip N" / subscribe / sponsor /
         credits / etc. (prefix-anchored on the stripped title).
      2. **Video-framing suffix** — titles ending in "... Guide" / "Tutorial" /
         "Walkthrough" / "Compilation" etc. are the creator's video-level name,
         never a single lineup.
      3. **Video-title intro card** — the 0:00 chapter whose title matches the
         *video_title* (when supplied). YouTube seeds the first chapter with
         the video's own name; when the creator opens on a title/promo card
         that chapter is whole-video framing, not a lineup.
      4. **Minimum duration** — chapters shorter than *min_duration_seconds*
         are transitions/stings, not a walk-aim-throw demo.

    ``parse_chapters`` stays a pure structural parser (its existing test
    contract — "Intro" parses as a chapter — is intentionally preserved). This
    is the separate "is this chapter plausibly a lineup" concern, kept as its
    own function for single responsibility and isolated unit testing.

    Args:
        chapters: Parsed chapters from ``parse_chapters``.
        min_duration_seconds: Chapters shorter than this are dropped.
        video_title: The source video's title (``VideoMeta.title``). When
            supplied, enables heuristic 3 (the video-title intro-card drop).
            Omit (None) to skip it — the function stays usable without video
            context for isolated testing.

    Returns:
        The subset of *chapters* that are plausibly real lineups, in order.
        May be empty (the orchestrator already treats "no chapters" as
        "skip this video").
    """
    kept: list[Chapter] = []
    for ch in chapters:
        title = ch.title.strip()
        if _NON_LINEUP_TITLE_RE.match(title):
            continue
        if _VIDEO_FRAMING_SUFFIX_RE.search(title):
            continue
        if _is_video_title_intro(ch, video_title):
            continue
        if (ch.end_seconds - ch.start_seconds) < min_duration_seconds:
            continue
        kept.append(ch)
    return kept


# Floor for the capped last-chapter window — enough to hold a full demo
# (walk-in + stand + aim + throw + result) even when this creator's typical
# chapter is shorter. Kept below clip_window_timestamps's 90s long-chapter
# threshold so the cap also drops the 0.30 lead-in skip that overshot the throw.
_LAST_CHAPTER_MAX_WINDOW_FLOOR_SECONDS = 45


def _cap_last_chapter_to_typical_duration(
    chapters: list[Chapter], video_duration: int
) -> list[Chapter]:
    """Shrink an artificially-long LAST chapter to this video's typical length.

    The last chapter has no next-chapter boundary, so its ``end_seconds`` is the
    video tail. On a video that continues past the final lineup demo (outro,
    extra footage), that tail inflates the chapter duration far past a real demo
    — and ``clip_window_timestamps`` then applies its long-chapter 0.30 lead-in
    skip, sampling PAST the (early) throw. Operator audit 2026-05-30, lineup
    9b2ad4c9 "Stairs - A Site": last chapter 403->508 = 105s, the throw window
    opened at +27s, and the real throw (~+17s, right after the aim) was never
    sampled — the localizer locked onto outro content +39s after the aim.

    Cap the last chapter's end at ``start + max(median sibling duration,
    _LAST_CHAPTER_MAX_WINDOW_FLOOR_SECONDS)`` so its throw-search window matches
    a normal chapter for this creator. SHRINK-ONLY (never extend a naturally
    short last chapter) and only with >=2 chapters (so a sibling median exists).
    The median adapts to each creator's pacing without a hardcoded length.

    Returns a new list (the last chapter ``replace``'d when capped), else the
    input unchanged.
    """
    if len(chapters) < 2:
        return chapters
    typical = median(c.end_seconds - c.start_seconds for c in chapters[:-1])
    last = chapters[-1]
    cap = last.start_seconds + max(typical, _LAST_CHAPTER_MAX_WINDOW_FLOOR_SECONDS)
    new_end = min(last.end_seconds, int(cap))
    if new_end >= last.end_seconds:
        return chapters  # already tighter than the cap — leave it
    return chapters[:-1] + [replace(last, end_seconds=new_end)]


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
            return _cap_last_chapter_to_typical_duration(result, video_duration)

    # Fallback to description regex.
    return _cap_last_chapter_to_typical_duration(
        _parse_chapters_from_description(description, video_duration),
        video_duration,
    )
