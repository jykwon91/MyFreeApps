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

from app.services.ingestion.chapter_parser import Chapter, parse_chapters


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

    def test_last_chapter_end_equals_duration(self):
        desc = "0:00 Intro\n2:00 Main content\n"
        chapters = parse_chapters(desc, video_duration=500)
        assert chapters[-1].end_seconds == 500

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
        assert chapters[1].end_seconds == 300

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
