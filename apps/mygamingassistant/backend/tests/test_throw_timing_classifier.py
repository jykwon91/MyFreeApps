"""Unit tests for classify_throw_timing_from_frames (PR2 clip pipeline).

All Anthropic SDK calls are mocked. This is a SEPARATE code path from the
game/map grid classifier — it takes frames directly (no DB, no reference
data), so these tests need no database fixtures. Verifies:
  - happy path: is_lineup_throw True with valid release/result indices
  - is_lineup_throw False → indices null, still success
  - parser enforces result_index >= release_index
  - out-of-range indices nulled (shared _validate_grid_index)
  - confidence clamped; invalid confidence dropped to None
  - frame labels carry the load-bearing timestamp (Frame i (t=..s):)
  - error handling: missing key, no frames, length mismatch, API + parse fail
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from app.services.classification.classifier_service import (
    classify_throw_timing_from_frames,
)

_FAKE_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

_PATCH_SETTINGS = "app.services.classification.classifier_service.settings"
_PATCH_ANTHROPIC = "app.services.classification.classifier_service.anthropic.Anthropic"


def _resp(payload: dict) -> MagicMock:
    resp = MagicMock()
    block = MagicMock()
    block.text = json.dumps(payload)
    resp.content = [block]
    return resp


async def _call(payload_or_exc, *, frames=None, timestamps=None, **kwargs):
    """Run the classifier with the Anthropic call mocked to a payload/exception."""
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
        result = await classify_throw_timing_from_frames(
            frames=frames,
            frame_timestamps=timestamps,
            chapter_title=kwargs.get("chapter_title", "B-site smoke"),
            chapter_duration=kwargs.get("chapter_duration", 30.0),
            utility_hint=kwargs.get("utility_hint"),
        )
    return result, mock_client


class TestThrowTimingHappyPath:
    @pytest.mark.asyncio
    async def test_valid_release_and_result(self):
        result, client = await _call(
            {
                "is_lineup_throw": True,
                "release_index": 2,
                "result_index": 4,
                "confidence": 0.82,
                "reasoning": "Smoke leaves hand frame 2, cloud blooms frame 4.",
            }
        )
        assert result.success is True
        assert result.is_lineup_throw is True
        assert result.release_index == 2
        assert result.result_index == 4
        assert result.confidence == pytest.approx(0.82)
        assert result.error_codes == []

    @pytest.mark.asyncio
    async def test_frame_labels_include_timestamp(self):
        """The timestamp in the frame label is load-bearing (caller maps it)."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 1,
             "confidence": 0.6, "reasoning": "x"},
            timestamps=[10.0, 12.5, 14.0, 16.0, 18.0, 20.0],
        )
        content = client.messages.create.call_args.kwargs["messages"][0]["content"]
        texts = [b["text"] for b in content if b["type"] == "text"]
        assert "Frame 1 (t=10.0s):" in texts
        assert "Frame 2 (t=12.5s):" in texts

    @pytest.mark.asyncio
    async def test_utility_hint_passed_as_context(self):
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.7, "reasoning": "x"},
            utility_hint="molotov",
        )
        content = client.messages.create.call_args.kwargs["messages"][0]["content"]
        joined = "\n".join(b["text"] for b in content if b["type"] == "text")
        assert "molotov" in joined

    @pytest.mark.asyncio
    async def test_system_prompt_is_cache_controlled(self):
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 1,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        assert system[0]["cache_control"] == {"type": "ephemeral"}


class TestThrowTimingVerdictAndParser:
    @pytest.mark.asyncio
    async def test_not_a_throw_nulls_indices(self):
        result, _ = await _call(
            {
                "is_lineup_throw": False,
                "release_index": None,
                "result_index": None,
                "confidence": 0.02,
                "reasoning": "Webcam talking-head intro.",
            }
        )
        assert result.success is True
        assert result.is_lineup_throw is False
        assert result.release_index is None
        assert result.result_index is None

    @pytest.mark.asyncio
    async def test_result_before_release_is_forced_equal(self):
        """A result cannot precede its own release — parser forces equality."""
        result, _ = await _call(
            {
                "is_lineup_throw": True,
                "release_index": 5,
                "result_index": 3,
                "confidence": 0.7,
                "reasoning": "x",
            }
        )
        assert result.release_index == 5
        assert result.result_index == 5

    @pytest.mark.asyncio
    async def test_out_of_range_indices_nulled(self):
        result, _ = await _call(
            {
                "is_lineup_throw": True,
                "release_index": 99,   # n=6 → out of range
                "result_index": 0,     # < 1 → out of range
                "confidence": 0.7,
                "reasoning": "x",
            }
        )
        assert result.success is True
        assert result.release_index is None
        assert result.result_index is None

    @pytest.mark.asyncio
    async def test_confidence_clamped(self):
        result, _ = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 1.7, "reasoning": "x"},
        )
        assert result.confidence == pytest.approx(1.0)

    @pytest.mark.asyncio
    async def test_invalid_confidence_dropped_to_none(self):
        result, _ = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": "high", "reasoning": "x"},
        )
        assert result.success is True
        assert result.confidence is None
        # Surfaced as a structured code, not silently dropped.
        assert "invalid_confidence:high" in result.error_codes


class TestThrowTimingErrorHandling:
    @pytest.mark.asyncio
    async def test_missing_api_key(self):
        with patch(_PATCH_SETTINGS) as mock_settings:
            mock_settings.anthropic_api_key = ""
            result = await classify_throw_timing_from_frames(
                frames=[_FAKE_PNG],
                frame_timestamps=[1.0],
                chapter_title="x",
                chapter_duration=10.0,
            )
        assert result.success is False
        assert result.error_codes == ["missing_api_key"]

    @pytest.mark.asyncio
    async def test_no_frames(self):
        with patch(_PATCH_SETTINGS) as mock_settings:
            mock_settings.anthropic_api_key = "sk-test"
            result = await classify_throw_timing_from_frames(
                frames=[],
                frame_timestamps=[],
                chapter_title="x",
                chapter_duration=10.0,
            )
        assert result.success is False
        assert result.error_codes == ["no_frames"]

    @pytest.mark.asyncio
    async def test_frame_timestamp_length_mismatch(self):
        """A misaligned frame/timestamp pair would silently corrupt clip
        bounds — must fail loud, not best-effort."""
        with patch(_PATCH_SETTINGS) as mock_settings:
            mock_settings.anthropic_api_key = "sk-test"
            result = await classify_throw_timing_from_frames(
                frames=[_FAKE_PNG, _FAKE_PNG],
                frame_timestamps=[1.0],
                chapter_title="x",
                chapter_duration=10.0,
            )
        assert result.success is False
        assert result.error_codes == ["frame_timestamp_mismatch"]

    @pytest.mark.asyncio
    async def test_rate_limit_error(self):
        import anthropic as anthropic_lib

        exc = anthropic_lib.RateLimitError.__new__(anthropic_lib.RateLimitError)
        exc.type = "rate_limit_error"
        exc.args = ("rate limited",)
        result, _ = await _call(exc)
        assert result.success is False
        assert any("rate_limit" in c for c in result.error_codes)

    @pytest.mark.asyncio
    async def test_api_status_error(self):
        import anthropic as anthropic_lib

        exc = anthropic_lib.APIStatusError.__new__(anthropic_lib.APIStatusError)
        exc.status_code = 529
        exc.type = "overloaded_error"
        exc.args = ("overloaded",)
        result, _ = await _call(exc)
        assert result.success is False
        assert result.error_codes  # populated

    @pytest.mark.asyncio
    async def test_json_parse_failure(self):
        bad = MagicMock()
        block = MagicMock()
        block.text = "not json at all {"
        bad.content = [block]
        with (
            patch(_PATCH_SETTINGS) as mock_settings,
            patch(_PATCH_ANTHROPIC) as mock_cls,
        ):
            mock_settings.anthropic_api_key = "sk-test"
            mock_settings.claude_classifier_model = "haiku"
            client = MagicMock()
            mock_cls.return_value = client
            client.messages.create.return_value = bad
            result = await classify_throw_timing_from_frames(
                frames=[_FAKE_PNG],
                frame_timestamps=[1.0],
                chapter_title="x",
                chapter_duration=10.0,
            )
        assert result.success is False
        assert result.error_codes == ["json_parse_error"]


class TestThrowTimingPerspectivePrompt:
    """Prompt-presence tests for the LANDING-pane perspective fix.

    The throw-timing classifier picks ``result_index``, which becomes the
    LANDING clip's anchor. Without these instructions the model picks
    fully-bloomed-but-rotated frames over partially-deployed same-perspective
    frames, producing landing clips from the wrong POV. If a refactor
    accidentally drops any of these blocks, fail loud here.
    """

    @pytest.mark.asyncio
    async def test_system_prompt_includes_game_visual_cues(self):
        """``_GAME_VISUAL_CUES`` must be injected so the model can read HUD
        cues (weapon-in-hand, ability icons, etc.) to detect that the player
        has switched utilities or rotated to a different perspective."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "HOW TO IDENTIFY THE GAME FROM THE SCREEN" in system_text, (
            "_GAME_VISUAL_CUES block is required so the timing model can "
            "spot weapon swaps / HUD changes that signal perspective change."
        )

    @pytest.mark.asyncio
    async def test_system_prompt_includes_same_perspective_rule(self):
        """The SAME-PERSPECTIVE rule must be the top-priority constraint on
        result_index — it beats the 'first clearly visible' rule. Removing
        this re-introduces the rotated-POV landing-clip bug."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "SAME-PERSPECTIVE RULE" in system_text
        assert "highest priority" in system_text
        assert "rotated > ~45°" in system_text
        assert "utility-in-hand has changed" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_includes_max_gap_fallback(self):
        """The MAX-GAP FALLBACK must instruct the model to set
        result_index = release_index + confidence <= 0.5 when no valid
        same-perspective frame exists in the ~2-4s window after release.
        This is what makes the downstream landing-clip generator skip
        emitting a misleading clip."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "MAX-GAP FALLBACK" in system_text
        assert "within ~6 frames" in system_text
        assert "result_index = release_index" in system_text
        assert "confidence <= 0.5" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_tightens_smoke_first_wisp_cue(self):
        """SMOKE cue must explicitly prefer the FIRST same-perspective wisp
        over a fully-bloomed frame from a rotated angle."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        # The smoke cue must call out the "earlier same-perspective frame"
        # preference, not just the generic "FIRST wisp" language.
        assert "the FIRST visible wisp" in system_text
        assert "earlier same-perspective frame shows even partial deployment" in system_text
