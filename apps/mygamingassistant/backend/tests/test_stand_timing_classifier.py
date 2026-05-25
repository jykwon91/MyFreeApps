"""Unit tests for classify_stand_timing_from_frames (post-#768 regression lock).

All Anthropic SDK calls are mocked. Mirrors :mod:`test_aim_timing_classifier`
structurally — the STAND classifier is the second member of the timing-
classifier family (throw / stand / aim).

Focus is prompt-presence regression locks for the post-#768 STAND quality
fix (2026-05-25): without concrete anchored examples + the EARLIEST-
SETTLED-STANCE structural anchor, STAND drifts later on re-runs because
the model has too much latitude over "any settled frame".
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from app.services.classification.stand_timing_classifier import (
    classify_stand_timing_from_frames,
)

_FAKE_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

_PATCH_SETTINGS = "app.services.classification.stand_timing_classifier.settings"
_PATCH_ANTHROPIC = "app.services.classification.stand_timing_classifier.anthropic.Anthropic"


def _resp(payload: dict) -> MagicMock:
    resp = MagicMock()
    block = MagicMock()
    block.text = json.dumps(payload)
    resp.content = [block]
    return resp


async def _call(payload_or_exc, *, frames=None, timestamps=None, **kwargs):
    frames = frames if frames is not None else [_FAKE_PNG] * 6
    timestamps = (
        timestamps if timestamps is not None
        else [10.0, 12.0, 14.0, 16.0, 18.0, 20.0]
    )
    with (
        patch(_PATCH_SETTINGS) as mock_settings,
        patch(_PATCH_ANTHROPIC) as mock_cls,
    ):
        mock_settings.anthropic_api_key = "sk-test"
        mock_settings.claude_classifier_model = "claude-haiku-4-5-20251001"
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        if isinstance(payload_or_exc, BaseException):
            mock_client.messages.create.side_effect = payload_or_exc
        else:
            mock_client.messages.create.return_value = _resp(payload_or_exc)
        result = await classify_stand_timing_from_frames(
            frames=frames,
            frame_timestamps=timestamps,
            chapter_title=kwargs.get("chapter_title", "B-site smoke"),
            chapter_duration=kwargs.get("chapter_duration", 30.0),
        )
    return result, mock_client


class TestStandTimingHappyPath:
    @pytest.mark.asyncio
    async def test_valid_stand_index(self):
        result, _ = await _call(
            {
                "has_stand_demonstration": True,
                "stand_index": 3,
                "confidence": 0.82,
                "reasoning": "Wide framing of cover wall frame 3.",
            }
        )
        assert result.success is True
        assert result.has_stand_demonstration is True
        assert result.stand_index == 3
        assert result.confidence == pytest.approx(0.82)
        assert result.error_codes == []

    @pytest.mark.asyncio
    async def test_no_stand_demo_nulls_index(self):
        result, _ = await _call(
            {
                "has_stand_demonstration": False,
                "stand_index": None,
                "confidence": 0.85,
                "reasoning": "Narrator walks up and immediately aims.",
            }
        )
        assert result.success is True
        assert result.has_stand_demonstration is False
        assert result.stand_index is None


class TestStandTimingErrorHandling:
    @pytest.mark.asyncio
    async def test_missing_api_key(self):
        with patch(_PATCH_SETTINGS) as mock_settings:
            mock_settings.anthropic_api_key = ""
            result = await classify_stand_timing_from_frames(
                frames=[_FAKE_PNG],
                frame_timestamps=[1.0],
                chapter_title="x",
                chapter_duration=10.0,
            )
        assert result.success is False
        assert result.error_codes == ["missing_api_key"]

    @pytest.mark.asyncio
    async def test_frame_timestamp_length_mismatch(self):
        with patch(_PATCH_SETTINGS) as mock_settings:
            mock_settings.anthropic_api_key = "sk-test"
            result = await classify_stand_timing_from_frames(
                frames=[_FAKE_PNG, _FAKE_PNG],
                frame_timestamps=[1.0],
                chapter_title="x",
                chapter_duration=10.0,
            )
        assert result.success is False
        assert result.error_codes == ["frame_timestamp_mismatch"]


class TestStandTimingPromptShape:
    """Prompt-presence tests for the STAND-specific instruction blocks.

    Regression locks for the post-#768 quality fix (2026-05-25). The bulk
    re-backfill that day surfaced STAND drift even though the STAND prompt
    wasn't touched in #768 — STAND's structural constraints were weaker
    than AIM's, so non-determinism across re-runs let the pick wander.
    """

    @pytest.mark.asyncio
    async def test_system_prompt_includes_game_visual_cues(self):
        _, client = await _call(
            {"has_stand_demonstration": True, "stand_index": 1,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "HOW TO IDENTIFY THE GAME FROM THE SCREEN" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_includes_non_utility_and_chapter_intro_blocks(self):
        """STAND must reject in-motion walk-up frames (knife or rifle in
        hand AND moving) AND chapter-intro overlay-dominant frames. Without
        these two blocks the pick drifts into the walk-up phase."""
        _, client = await _call(
            {"has_stand_demonstration": True, "stand_index": 1,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "NON-UTILITY HELD-WEAPON DISAMBIGUATION" in system_text
        assert "CHAPTER-INTRO PHASE EXCLUSION" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_includes_structural_anchor(self):
        """STRUCTURAL ANCHOR — MIDDLE of settled-stance — is the post-
        2026-05-25 operator-audit fix. The prior EARLIEST rule put the
        anchor at the edge of the settled phase; the downstream 1s clip
        then caught walk-up motion on the pre-side. The new rule
        requires the picked frame to be in the MIDDLE of the settled-
        stance phase (stationary frames on BOTH sides) so the clip
        stays stationary."""
        _, client = await _call(
            {"has_stand_demonstration": True, "stand_index": 1,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "STRUCTURAL ANCHOR" in system_text
        assert "MIDDLE" in system_text
        assert "MIDDLE OF SETTLED-STANCE" in system_text
        # WHEN MULTIPLE DEMONSTRATIONS EXIST must agree with the anchor
        # — prefer the longest contiguous settled segment, NOT the first
        # settled frame. Substring-checked piece-wise to survive prompt
        # line-wrapping.
        assert "LONGEST contiguous" in system_text
        assert "Length of stationary stance dominates" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_includes_concrete_anchored_examples(self):
        """Regression lock for post-#768 STAND quality fix (2026-05-25):
        same anchor strategy as AIM — abstract rule plus NON-EXHAUSTIVE
        concrete examples so Claude has a token-level pattern to match."""
        _, client = await _call(
            {"has_stand_demonstration": True, "stand_index": 1,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "karambit" in system_text.lower()
        assert "Reaver" in system_text
        assert "NON-EXHAUSTIVE" in system_text
        assert "VARIES BY CREATOR" in system_text
