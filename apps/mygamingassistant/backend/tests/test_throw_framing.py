"""Unit tests for movement-aware throw-clip framing (``throw_framing``).

Pure mapping from a lineup's technique-footer phrase to the pre-release clip
pad — no I/O, no Claude, no DB. The end-to-end wiring (technique -> wider
generated clip window) is asserted in ``test_clip_generator.py``
``TestMovementAwareFraming``.
"""
from __future__ import annotations

import pytest

from app.services.ingestion.throw_framing import (
    _STANDING_PRE_RELEASE_SECONDS,
    _movement_from_technique,
    pre_release_seconds_for_technique,
)


class TestMovementFromTechnique:
    @pytest.mark.parametrize(
        "technique,expected",
        [
            ("Standing + LMB", "standing"),
            ("Jumpthrow + LMB", "jump"),
            ("Jumpthrow-bind + LMB", "jump"),
            ("Run + RMB", "run"),
            ("run-throw + LMB", "run"),
            ("Walk + LMB+RMB", "walk"),
            ("walk-throw", "walk"),
            ("Crouch + LMB", "crouch"),
            ("crouch-throw + RMB", "crouch"),
            # Partial answer — just the movement, no input component.
            ("Jumpthrow", "jump"),
            # Case / surrounding whitespace insensitivity.
            ("  JUMPTHROW + lmb  ", "jump"),
        ],
    )
    def test_recognised_movements(self, technique, expected):
        assert _movement_from_technique(technique) == expected

    @pytest.mark.parametrize(
        "technique",
        [
            None,
            "",
            "   ",
            # Valorant ability casts carry no movement component.
            "E + 2-charge + 1-bounce",
            "C + aimed",
            "Q + full-charge",
            "X + held-cast",
            # Head with no recognised movement word.
            "Lineup + LMB",
        ],
    )
    def test_no_movement(self, technique):
        assert _movement_from_technique(technique) is None


class TestPreReleaseSecondsForTechnique:
    def test_standing_is_default(self):
        assert pre_release_seconds_for_technique("Standing + LMB") == pytest.approx(1.0)

    def test_crouch_is_default(self):
        # Crouch is near-stationary — same pad as standing.
        assert pre_release_seconds_for_technique("Crouch + LMB") == pytest.approx(1.0)

    def test_jump_widens(self):
        assert pre_release_seconds_for_technique("Jumpthrow + LMB") == pytest.approx(1.5)

    def test_walk_widens(self):
        assert pre_release_seconds_for_technique("Walk + LMB") == pytest.approx(1.5)

    def test_run_widens_most(self):
        assert pre_release_seconds_for_technique("Run + RMB") == pytest.approx(2.0)

    @pytest.mark.parametrize("technique", [None, "", "E + 2-charge", "C + aimed"])
    def test_absent_or_valorant_uses_default(self, technique):
        assert pre_release_seconds_for_technique(technique) == pytest.approx(
            _STANDING_PRE_RELEASE_SECONDS
        )

    def test_moving_pad_strictly_exceeds_standing(self):
        # The whole point: a moving throw opens the clip earlier than a
        # standing one so the run-up / jump windup is in frame.
        standing = pre_release_seconds_for_technique("Standing + LMB")
        for moving in ("Jumpthrow + LMB", "Run + RMB", "Walk + LMB"):
            assert pre_release_seconds_for_technique(moving) > standing
