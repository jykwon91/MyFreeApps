"""Unit tests for the chapter_parser ingestion service (PR 4).

Tests cover:
- Standard YouTube chapter formats (MM:SS, HH:MM:SS)
- Description with mixed chapter + non-chapter lines
- Description with only 1 timestamp (should NOT parse as chapters)
- yt-dlp native chapters preferred over description regex
- Monotonically increasing timestamp enforcement
"""
from __future__ import annotations

import pytest

from app.services.ingestion.chapter_parser import (
    Chapter,
    filter_lineup_chapters,
    parse_chapters,
)


# ---------------------------------------------------------------------------
# Description regex path
# ---------------------------------------------------------------------------

class TestDescriptionChapters:
    def test_standard_mm_ss_format(self):
        desc = (
            "0:00 Intro\n"
            "1:30 A-site smoke from CT\n"
            "3:45 B-site smoke from mid\n"
        )
        chapters = parse_chapters(desc, video_duration=300)
        assert len(chapters) == 3
        assert chapters[0] == Chapter(start_seconds=0, end_seconds=90, title="Intro")
        assert chapters[1] == Chapter(start_seconds=90, end_seconds=225, title="A-site smoke from CT")
        assert chapters[2] == Chapter(start_seconds=225, end_seconds=300, title="B-site smoke from mid")

    def test_hh_mm_ss_format(self):
        desc = (
            "0:00:00 Opening\n"
            "0:12:30 First lineup\n"
            "1:05:45 Late-game smoke\n"
        )
        chapters = parse_chapters(desc, video_duration=4000)
        assert len(chapters) == 3
        assert chapters[0].start_seconds == 0
        assert chapters[1].start_seconds == 750  # 12*60 + 30
        assert chapters[2].start_seconds == 3945  # 1*3600 + 5*60 + 45
        assert chapters[2].end_seconds == 4000

    def test_inflated_last_chapter_capped_to_typical_duration(self):
        # Last chapter [120, 500] (380s) far exceeds the single sibling's 120s.
        # The last-chapter window cap shrinks it to
        # start + max(median_sibling=120, floor=45) = 120 + 120 = 240 so the
        # throw-search window matches a normal chapter (see 9b2ad4c9 "Stairs").
        desc = "0:00 Intro\n2:00 Main content\n"
        chapters = parse_chapters(desc, video_duration=500)
        assert chapters[-1].end_seconds == 240

    def test_description_with_non_chapter_lines(self):
        desc = (
            "Subscribe for more! Like + Comment\n"
            "\n"
            "Timestamps:\n"
            "0:00 Intro\n"
            "2:30 B-site default\n"
            "\n"
            "Follow me on Twitter @player\n"
            "Music: Lofi Beats\n"
        )
        chapters = parse_chapters(desc, video_duration=600)
        assert len(chapters) == 2
        assert chapters[0].title == "Intro"
        assert chapters[1].title == "B-site default"

    def test_single_timestamp_not_parsed(self):
        desc = "0:00 The whole video is one lineup\n"
        chapters = parse_chapters(desc, video_duration=300)
        assert chapters == []

    def test_zero_timestamps_returns_empty(self):
        desc = "No timestamps here at all. Just a description."
        chapters = parse_chapters(desc, video_duration=300)
        assert chapters == []

    def test_non_monotonic_timestamps_skipped(self):
        """Timestamps that go backwards are ignored (out-of-order lines)."""
        desc = (
            "0:00 Intro\n"
            "5:00 Main\n"
            "3:00 This is out of order\n"
            "8:00 End\n"
        )
        chapters = parse_chapters(desc, video_duration=600)
        # 3:00 is non-monotonic relative to 5:00 — should be skipped.
        assert len(chapters) == 3
        titles = [c.title for c in chapters]
        assert "This is out of order" not in titles

    def test_timestamp_with_leading_whitespace(self):
        desc = "  0:00 Intro\n  1:00 Second chapter\n"
        chapters = parse_chapters(desc, video_duration=200)
        assert len(chapters) == 2

    def test_chapter_titles_stripped(self):
        desc = "0:00   Smoke from T spawn   \n1:00 Flash\n"
        chapters = parse_chapters(desc, video_duration=200)
        assert chapters[0].title == "Smoke from T spawn"

    def test_end_seconds_of_last_chapter_capped_at_duration(self):
        desc = "0:00 Intro\n4:59 Last chapter\n"
        chapters = parse_chapters(desc, video_duration=300)
        assert chapters[-1].end_seconds == 300


# ---------------------------------------------------------------------------
# Native chapters path (yt-dlp preferred)
# ---------------------------------------------------------------------------

class TestNativeChapters:
    def test_native_chapters_preferred_over_description(self):
        native = [
            {"start_time": 0, "end_time": 60, "title": "Native chapter 1"},
            {"start_time": 60, "end_time": 120, "title": "Native chapter 2"},
        ]
        desc = "0:00 Description chapter 1\n2:00 Description chapter 2\n"
        chapters = parse_chapters(desc, video_duration=120, native_chapters=native)
        assert len(chapters) == 2
        assert chapters[0].title == "Native chapter 1"
        assert chapters[1].title == "Native chapter 2"

    def test_native_chapters_with_correct_times(self):
        native = [
            {"start_time": 0, "end_time": 90, "title": "Intro"},
            {"start_time": 90, "end_time": 300, "title": "B-site smokes"},
        ]
        chapters = parse_chapters("", video_duration=300, native_chapters=native)
        assert chapters[0].start_seconds == 0
        assert chapters[0].end_seconds == 90
        assert chapters[1].start_seconds == 90
        # Last chapter [90, 300] (210s) exceeds the sibling's 90s, so the
        # last-chapter window cap shrinks it to
        # 90 + max(median_sibling=90, floor=45) = 180.
        assert chapters[1].end_seconds == 180

    def test_empty_native_chapters_falls_back_to_description(self):
        desc = "0:00 Intro\n1:00 Second\n"
        chapters = parse_chapters(desc, video_duration=200, native_chapters=[])
        assert len(chapters) == 2
        assert chapters[0].title == "Intro"

    def test_none_native_chapters_falls_back_to_description(self):
        desc = "0:00 Intro\n1:00 Second\n"
        chapters = parse_chapters(desc, video_duration=200, native_chapters=None)
        assert len(chapters) == 2

    def test_native_chapters_skips_entries_without_title(self):
        native = [
            {"start_time": 0, "end_time": 60, "title": ""},  # empty title skipped
            {"start_time": 60, "end_time": 120, "title": "Valid chapter"},
        ]
        chapters = parse_chapters("", video_duration=120, native_chapters=native)
        assert len(chapters) == 1
        assert chapters[0].title == "Valid chapter"

    def test_native_chapters_handles_malformed_entries(self):
        native = [
            {"start_time": "not-a-number", "end_time": 60, "title": "Bad"},
            {"start_time": 60, "end_time": 120, "title": "Good"},
        ]
        # The malformed entry should be skipped; we get 1 valid chapter.
        # Falls back to description because only native "Good" is valid
        # (the list is still non-empty so no fallback — just 1 result).
        chapters = parse_chapters("", video_duration=120, native_chapters=native)
        # "Bad" has non-numeric start_time — parser skips it gracefully
        assert all(c.title != "Bad" for c in chapters)


# ---------------------------------------------------------------------------
# Last-chapter window cap (_cap_last_chapter_to_typical_duration)
#
# The last chapter has no next-chapter boundary, so its end is the video tail.
# When the video continues past the final lineup demo, that inflates the chapter
# duration and trips clip_window_timestamps's long-chapter lead-in skip, which
# samples PAST the (early) throw (operator audit 2026-05-30, lineup 9b2ad4c9
# "Stairs": last chapter 403->508=105s, throw window opened +27s, real throw
# ~+17s never sampled). The cap shrinks the last chapter to this creator's
# typical length: start + max(median sibling duration, 45s floor), shrink-only,
# only with >=2 chapters.
# ---------------------------------------------------------------------------

class TestLastChapterCap:
    def test_inflated_last_chapter_capped_by_median(self):
        # Siblings 40s + 50s (median 45) > 45 floor → cap window = 45.
        native = [
            {"start_time": 0, "end_time": 40, "title": "L1"},
            {"start_time": 40, "end_time": 90, "title": "L2"},
            {"start_time": 90, "end_time": 290, "title": "L3 (inflated)"},
        ]
        chapters = parse_chapters("", video_duration=290, native_chapters=native)
        # last [90, 290] (200s) capped to 90 + max(median=45, 45) = 135.
        assert chapters[-1].end_seconds == 135

    def test_floor_applies_when_typical_below_floor(self):
        # Siblings 20s each (median 20 < 45) → floor 45 governs.
        native = [
            {"start_time": 0, "end_time": 20, "title": "L1"},
            {"start_time": 20, "end_time": 40, "title": "L2"},
            {"start_time": 40, "end_time": 200, "title": "L3 (inflated)"},
        ]
        chapters = parse_chapters("", video_duration=200, native_chapters=native)
        # last [40, 200] (160s) capped to 40 + max(20, 45) = 85.
        assert chapters[-1].end_seconds == 85

    def test_tight_last_chapter_untouched(self):
        # Last chapter already shorter than the cap window → never extended.
        native = [
            {"start_time": 0, "end_time": 100, "title": "L1"},
            {"start_time": 100, "end_time": 130, "title": "L2 (short)"},
        ]
        chapters = parse_chapters("", video_duration=130, native_chapters=native)
        assert chapters[-1].end_seconds == 130  # min(130, 100+max(100,45)) = 130

    def test_single_chapter_not_capped(self):
        # <2 chapters → no sibling median → no-op.
        native = [{"start_time": 0, "end_time": 300, "title": "Only chapter"}]
        chapters = parse_chapters("", video_duration=300, native_chapters=native)
        assert len(chapters) == 1
        assert chapters[0].end_seconds == 300


# ---------------------------------------------------------------------------
# filter_lineup_chapters — denylist + min-duration (Phase-1 cheap win)
# ---------------------------------------------------------------------------

class TestFilterLineupChapters:
    def _ch(self, title: str, start: int = 0, end: int = 120) -> Chapter:
        return Chapter(start_seconds=start, end_seconds=end, title=title)

    def test_keeps_real_lineup_titles(self):
        chapters = [
            self._ch("A-site smoke from T spawn", 0, 60),
            self._ch("Mid window flash", 60, 120),
            self._ch("CT smoke from B site", 120, 200),
        ]
        kept = filter_lineup_chapters(chapters)
        assert [c.title for c in kept] == [
            "A-site smoke from T spawn",
            "Mid window flash",
            "CT smoke from B site",
        ]

    @pytest.mark.parametrize(
        "title",
        [
            "Intro",
            "intro",
            "INTRO",
            "Outro",
            "Tip 1",
            "Tip 2",
            "Tip 3",
            "Tips",
            "Subscribe",
            "Like and Subscribe",
            "Smash that like button",
            "Thanks for watching",
            "Thank you",
            "Conclusion",
            "Summary",
            "Recap",
            "Wrap up",
            "Wrap-up",
            "Overview",
            "Sponsor",
            "Shoutout",
            "Shout out",
            "Credits",
            "Disclaimer",
            "Patreon",
            "Discord",
            "Socials",
            "Links",
            "Giveaway",
            "Announcement",
            "Update",
            "News",
            "Donate",
            "The end",
            "Bye",
            "See you",
        ],
    )
    def test_drops_structural_titles(self, title: str):
        kept = filter_lineup_chapters([self._ch(title, 0, 120)])
        assert kept == []

    def test_observed_tigerr_video_all_dropped(self):
        """The real video that surfaced this bug: Intro/Tip 1-3/Outro."""
        chapters = [
            self._ch("Intro", 0, 19),
            self._ch("Tip 1", 19, 146),
            self._ch("Tip 2", 146, 245),
            self._ch("Tip 3", 245, 467),
            self._ch("Outro", 467, 540),
        ]
        assert filter_lineup_chapters(chapters) == []

    def test_denylist_anchored_at_start_not_substring(self):
        """A real lineup whose title merely contains a denylist word mid-string
        must NOT be dropped — the denylist is start-anchored."""
        chapters = [
            self._ch("Mid smoke (quick tip)", 0, 60),
            self._ch("Smoke that blocks the news ticker", 60, 120),
            self._ch("Flash for the subscribe-style peek", 120, 180),
        ]
        kept = filter_lineup_chapters(chapters)
        assert len(kept) == 3

    def test_min_duration_drops_short_chapters(self):
        chapters = [
            self._ch("A smoke", 0, 10),       # 10s — too short
            self._ch("B smoke", 10, 30),      # 20s — kept
            self._ch("Mid flash", 30, 44),    # 14s — too short
            self._ch("CT smoke", 44, 200),    # long — kept
        ]
        kept = filter_lineup_chapters(chapters)
        assert [c.title for c in kept] == ["B smoke", "CT smoke"]

    def test_min_duration_boundary_is_inclusive(self):
        """Exactly min_duration_seconds is kept (only strictly shorter drops)."""
        kept = filter_lineup_chapters([self._ch("A smoke", 0, 15)])
        assert len(kept) == 1

    def test_custom_min_duration(self):
        chapters = [self._ch("A smoke", 0, 20), self._ch("B smoke", 20, 60)]
        kept = filter_lineup_chapters(chapters, min_duration_seconds=30)
        assert [c.title for c in kept] == ["B smoke"]

    def test_empty_input_returns_empty(self):
        assert filter_lineup_chapters([]) == []

    def test_mixed_real_and_structural(self):
        chapters = [
            self._ch("Intro", 0, 30),
            self._ch("A-site smoke from CT", 30, 120),
            self._ch("Tip 2", 120, 150),
            self._ch("B-site flash from mid", 150, 240),
            self._ch("Outro", 240, 300),
        ]
        kept = filter_lineup_chapters(chapters)
        assert [c.title for c in kept] == [
            "A-site smoke from CT",
            "B-site flash from mid",
        ]


# ---------------------------------------------------------------------------
# filter_lineup_chapters — video-framing suffix + video-title intro card
# (added 2026-05-28 after "Best Anubis Smokes Guide" became a junk lineup)
# ---------------------------------------------------------------------------

class TestVideoFramingAndIntroCard:
    def _ch(self, title: str, start: int = 0, end: int = 120) -> Chapter:
        return Chapter(start_seconds=start, end_seconds=end, title=title)

    @pytest.mark.parametrize(
        "title",
        [
            "Best Anubis Smokes Guide",
            "CS2 Smoke Guide",
            "Mirage Lineups Tutorial",
            "Full Dust2 Walkthrough",
            "Top 10 Smokes Compilation",
            "Insane Clutch Montage",
            "Complete Utility Breakdown",
            "Pro Smokes Masterclass",
        ],
    )
    def test_drops_video_framing_suffix(self, title: str):
        """Titles ending in a video-level framing noun are never a single
        lineup — dropped regardless of video_title."""
        assert filter_lineup_chapters([self._ch(title, 0, 300)]) == []

    def test_framing_suffix_anchored_at_end_not_substring(self):
        """A real lineup whose title merely CONTAINS a framing word mid-string
        must NOT be dropped — the framing match is suffix-anchored."""
        chapters = [
            self._ch("Smoke guide line on B ramp", 0, 60),
            self._ch("Tutorial-style flash for A main", 60, 120),
        ]
        kept = filter_lineup_chapters(chapters)
        assert len(kept) == 2

    def test_drops_intro_card_matching_video_title(self):
        """The exact regression: a 0:00 chapter whose title is the video
        title is the intro card, not a lineup."""
        chapters = [
            self._ch("Best Anubis Smokes Guide", 0, 45),
            self._ch("A site from ramp", 45, 200),
        ]
        kept = filter_lineup_chapters(
            chapters, video_title="Best Anubis Smokes Guide"
        )
        assert [c.title for c in kept] == ["A site from ramp"]

    def test_intro_card_tolerates_video_title_suffix(self):
        """YouTube appends a short ' (CS2)' / ' | Channel' suffix to the video
        title; the 0:00 chapter still matches as a >=60%-length prefix."""
        chapters = [self._ch("Best Anubis Smokes", 0, 45)]
        kept = filter_lineup_chapters(
            chapters, video_title="Best Anubis Smokes (CS2)"
        )
        assert kept == []

    def test_short_real_first_lineup_prefixing_title_is_kept(self):
        """A short genuine first-lineup title that merely prefixes the video
        title must survive — the 60% length guard protects it."""
        chapters = [self._ch("A Site", 0, 60)]
        kept = filter_lineup_chapters(
            chapters, video_title="A Site Smokes And Flashes For Mirage"
        )
        assert [c.title for c in kept] == ["A Site"]

    def test_intro_card_only_applies_to_zero_start(self):
        """A chapter that matches the video title but is NOT at 0:00 is a
        real (oddly-named) lineup, not the intro card — kept."""
        chapters = [self._ch("Real lineup at start", 0, 60),
                    self._ch("Anubis Smokes", 120, 200)]
        kept = filter_lineup_chapters(
            chapters, video_title="Anubis Smokes"
        )
        assert [c.title for c in kept] == [
            "Real lineup at start", "Anubis Smokes"
        ]

    def test_no_video_title_skips_intro_heuristic(self):
        """Without video_title the intro-card heuristic is inert (back-compat);
        the framing-suffix and denylist heuristics still apply."""
        chapters = [self._ch("Best Anubis Smokes", 0, 45)]  # no 'guide' suffix
        kept = filter_lineup_chapters(chapters)  # video_title omitted
        assert [c.title for c in kept] == ["Best Anubis Smokes"]
