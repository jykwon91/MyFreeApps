"""Tests for ``lineup_service._wider_source_start_in_video`` + its surfacing
through ``_build_admin_read`` as ``clip_source_start_in_video_s`` /
``landing_clip_source_start_in_video_s``.

The trim editor's absolute-in-video timestamp readout anchors on these
fields. Before they existed, the readout anchored on
``chapter_start_seconds`` and silently drifted by ``clip_source_pre_seconds``
— making the wider source's leading padding invisible to the operator and
producing the "you only added padding to the end" symptom even though the
backend was padding symmetrically. These tests pin the new contract so that
regression cannot recur.
"""
from __future__ import annotations

import types
import uuid
from unittest.mock import patch

import pytest

from app.core.config import settings
from app.services.game import lineup_service
from app.services.game.lineup_service import _build_admin_read


def _lineup_stub(
    *,
    chapter_start_seconds: int | None = 100,
    clip_url: str | None = "tight.mp4",
    clip_url_original: str | None = "wider-throw.mp4",
    landing_clip_url: str | None = "tight-landing.mp4",
    landing_clip_url_original: str | None = "wider-landing.mp4",
) -> types.SimpleNamespace:
    """Minimal stub for LineupRead.model_validate + _build_admin_read."""
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        title="t",
        status="accepted",
        chapter_start_seconds=chapter_start_seconds,
        clip_url=clip_url,
        clip_url_original=clip_url_original,
        landing_clip_url=landing_clip_url,
        landing_clip_url_original=landing_clip_url_original,
        clip_trim_start_s=None,
        clip_trim_end_s=None,
        landing_clip_trim_start_s=None,
        landing_clip_trim_end_s=None,
        youtube_video_id=None,
        chapter_title=None,
        stand_screenshot_url=None,
        aim_screenshot_url=None,
        stand_clip_url=None,
        aim_clip_url=None,
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


def _no_sign():
    """Short-circuit MinIO signing — tests don't have MinIO env."""
    return patch.object(lineup_service, "_sign_screenshot_url",
                        side_effect=lambda key: key)


class TestWiderSourceStartInVideo:
    def test_symmetric_padding_when_chapter_far_from_video_start(self):
        """Mid-video chapter: source_start = chapter_start - pre_seconds.

        With the default ``clip_source_pre_seconds=7.5``, a chapter at 100s
        produces a wider source that starts at 92.5s — i.e. the 7.5s of
        pre-padding is fully realised (no clamping at zero).
        """
        lineup = _lineup_stub(chapter_start_seconds=100)
        with _no_sign():
            read = _build_admin_read(lineup)
        expected = 100.0 - settings.clip_source_pre_seconds
        assert read.clip_source_start_in_video_s == pytest.approx(expected)
        assert read.landing_clip_source_start_in_video_s == pytest.approx(expected)

    def test_clamped_to_zero_when_chapter_near_video_start(self):
        """A chapter that starts inside ``pre_seconds`` of the video origin:
        the wider source's start clamps to 0 — there's no negative-seek into
        the source video. Mirrors ``wide_source_bounds``' ``max(0, ...)``.
        """
        # 3s < pre_seconds (7.5) → would-be -4.5s clamps to 0.
        lineup = _lineup_stub(chapter_start_seconds=3)
        with _no_sign():
            read = _build_admin_read(lineup)
        assert read.clip_source_start_in_video_s == 0.0
        assert read.landing_clip_source_start_in_video_s == 0.0

    def test_null_when_no_chapter_anchor(self):
        """Manual-upload lineups have no chapter — no in-video anchor exists.

        The readout falls back to seconds-into-source in that case (see
        ``buildReadout`` in PaneTrimOverlay.tsx).
        """
        lineup = _lineup_stub(chapter_start_seconds=None)
        with _no_sign():
            read = _build_admin_read(lineup)
        assert read.clip_source_start_in_video_s is None
        assert read.landing_clip_source_start_in_video_s is None

    def test_null_when_no_wider_source(self):
        """Legacy ``clip_url_original is None`` rows: there's nothing wider
        than the tight clip, so no in-video start to surface.
        """
        lineup = _lineup_stub(
            clip_url_original=None,
            landing_clip_url_original=None,
        )
        with _no_sign():
            read = _build_admin_read(lineup)
        assert read.clip_source_start_in_video_s is None
        assert read.landing_clip_source_start_in_video_s is None

    def test_null_when_legacy_tight_equals_wide(self):
        """The 0015 migration backfilled ``*_url_original = *_url`` so the
        trim editor had something to read on pre-PR4 rows. Those rows have
        an "original" key but no actual wider window — the value must stay
        None to keep the readout from falsely claiming an in-video anchor
        until the widen-source backfill upgrades them.
        """
        lineup = _lineup_stub(
            clip_url="same.mp4",
            clip_url_original="same.mp4",
            landing_clip_url="same-landing.mp4",
            landing_clip_url_original="same-landing.mp4",
        )
        with _no_sign():
            read = _build_admin_read(lineup)
        assert read.clip_source_start_in_video_s is None
        assert read.landing_clip_source_start_in_video_s is None

    def test_throw_and_landing_resolved_independently(self):
        """Only one pane having a wider source must not poison the other.

        Real shape: throw has been widened (different keys), landing is still
        on the legacy tight==wide posture. The widened pane reports a
        non-null in-video start; the unwidened one stays None.
        """
        lineup = _lineup_stub(
            chapter_start_seconds=50,
            clip_url="throw-tight.mp4",
            clip_url_original="throw-wider.mp4",
            landing_clip_url="landing-tight.mp4",
            landing_clip_url_original="landing-tight.mp4",
        )
        with _no_sign():
            read = _build_admin_read(lineup)
        expected = 50.0 - settings.clip_source_pre_seconds
        assert read.clip_source_start_in_video_s == pytest.approx(expected)
        assert read.landing_clip_source_start_in_video_s is None


class TestPublicReadStripsField:
    """The new fields are operator-only — the public ``_build_read`` shape
    must never leak them (same rationale as the existing ``*_url_original``
    + offset stripping). A regression here would expose the wider-source
    timeline to anonymous viewers along with the keys themselves.
    """

    def test_public_read_strips_both_fields(self):
        lineup = _lineup_stub(chapter_start_seconds=100)
        with _no_sign():
            read = lineup_service._build_read(lineup)
        assert read.clip_source_start_in_video_s is None
        assert read.landing_clip_source_start_in_video_s is None
