"""Unit tests for classify_throw_technique_from_frames (PR3 footer text).

All Anthropic SDK calls are mocked. A SEPARATE code path from both the grid
classifier and the PR2 throw-timing call — takes frames directly (no DB, no
reference data), so no database fixtures. Verifies:
  - CS2 / Valorant happy paths + the per-game vocabulary block selection
  - frame labels carry the load-bearing timestamp (Frame i (t=..s):)
  - system prompt is cache-controlled
  - the 0.55 confidence gate nulls a sub-threshold technique (structured code)
  - null / non-numeric confidence also nulls technique (no unqualified fact)
  - a null technique from the model is a valid "cannot determine", not an error
  - long technique hard-capped at the DB column width (80)
  - error handling: missing key, no frames, length mismatch, API + parse fail
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from app.services.classification.throw_technique_classifier import (
    classify_throw_technique_from_frames,
)

_FAKE_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

_PATCH_SETTINGS = "app.services.classification.throw_technique_classifier.settings"
_PATCH_ANTHROPIC = "app.services.classification.throw_technique_classifier.anthropic.Anthropic"


def _resp(payload: dict) -> MagicMock:
    resp = MagicMock()
    block = MagicMock()
    block.text = json.dumps(payload)
    resp.content = [block]
    return resp


async def _call(payload_or_exc, *, frames=None, timestamps=None, **kwargs):
    """Run the classifier with the Anthropic call mocked to a payload/exc."""
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
        result = await classify_throw_technique_from_frames(
            frames=frames,
            frame_timestamps=timestamps,
            chapter_title=kwargs.get("chapter_title", "B-site smoke"),
            chapter_duration=kwargs.get("chapter_duration", 30.0),
            game_slug=kwargs.get("game_slug"),
        )
    return result, mock_client


class TestThrowTechniqueHappyPath:
    @pytest.mark.asyncio
    async def test_cs2_technique(self):
        result, _ = await _call(
            {
                "technique": "Jumpthrow + LMB",
                "confidence": 0.87,
                "reasoning": "Player jumps frame 3, grenade slot empties.",
            },
            game_slug="cs2",
        )
        assert result.success is True
        assert result.technique == "Jumpthrow + LMB"
        assert result.confidence == pytest.approx(0.87)
        assert result.error_codes == []

    @pytest.mark.asyncio
    async def test_valorant_technique(self):
        result, _ = await _call(
            {
                "technique": "E + 2-charge + 1-bounce",
                "confidence": 0.91,
                "reasoning": "Sova bow, 2 charge dots, one wall bounce.",
            },
            game_slug="valorant",
        )
        assert result.success is True
        assert result.technique == "E + 2-charge + 1-bounce"
        assert result.confidence == pytest.approx(0.91)

    @pytest.mark.asyncio
    async def test_cs2_vocab_block_selected(self):
        _, client = await _call(
            {"technique": "Run + RMB", "confidence": 0.7, "reasoning": "x"},
            game_slug="cs2",
        )
        content = client.messages.create.call_args.kwargs["messages"][0]["content"]
        joined = "\n".join(b["text"] for b in content if b["type"] == "text")
        assert "GAME: CS2." in joined
        assert "GAME: Valorant." not in joined

    @pytest.mark.asyncio
    async def test_valorant_vocab_block_selected(self):
        _, client = await _call(
            {"technique": "C + aimed", "confidence": 0.7, "reasoning": "x"},
            game_slug="valorant",
        )
        content = client.messages.create.call_args.kwargs["messages"][0]["content"]
        joined = "\n".join(b["text"] for b in content if b["type"] == "text")
        assert "GAME: Valorant." in joined
        assert "GAME: CS2." not in joined

    @pytest.mark.asyncio
    async def test_unknown_game_uses_generic_block(self):
        _, client = await _call(
            {"technique": "Standing + LMB", "confidence": 0.7,
             "reasoning": "x"},
            game_slug=None,
        )
        content = client.messages.create.call_args.kwargs["messages"][0]["content"]
        joined = "\n".join(b["text"] for b in content if b["type"] == "text")
        assert "GAME UNKNOWN" in joined

    @pytest.mark.asyncio
    async def test_frame_labels_include_timestamp(self):
        _, client = await _call(
            {"technique": "Jumpthrow + LMB", "confidence": 0.7,
             "reasoning": "x"},
            timestamps=[10.0, 12.5, 14.0, 16.0, 18.0, 20.0],
        )
        content = client.messages.create.call_args.kwargs["messages"][0]["content"]
        texts = [b["text"] for b in content if b["type"] == "text"]
        assert "Frame 1 (t=10.0s):" in texts
        assert "Frame 2 (t=12.5s):" in texts

    @pytest.mark.asyncio
    async def test_system_prompt_is_cache_controlled(self):
        _, client = await _call(
            {"technique": "Run + RMB", "confidence": 0.7, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        assert system[0]["cache_control"] == {"type": "ephemeral"}


class TestThrowTechniqueGateAndParser:
    @pytest.mark.asyncio
    async def test_null_technique_is_valid_not_error(self):
        result, _ = await _call(
            {"technique": None, "confidence": 0.7,
             "reasoning": "Static setup only, no release visible."},
        )
        assert result.success is True
        assert result.technique is None
        assert result.error_codes == []

    @pytest.mark.asyncio
    async def test_low_confidence_drops_technique(self):
        result, _ = await _call(
            {"technique": "Jumpthrow + LMB", "confidence": 0.40,
             "reasoning": "x"},
        )
        assert result.success is True
        assert result.technique is None
        assert "technique_low_confidence:0.40" in result.error_codes

    @pytest.mark.asyncio
    async def test_confidence_exactly_at_gate_is_kept(self):
        result, _ = await _call(
            {"technique": "Run + LMB", "confidence": 0.55, "reasoning": "x"},
        )
        assert result.technique == "Run + LMB"

    @pytest.mark.asyncio
    async def test_null_confidence_drops_technique(self):
        result, _ = await _call(
            {"technique": "Standing + LMB", "confidence": None,
             "reasoning": "x"},
        )
        assert result.success is True
        assert result.technique is None
        assert "technique_no_confidence" in result.error_codes

    @pytest.mark.asyncio
    async def test_invalid_confidence_dropped_and_technique_nulled(self):
        result, _ = await _call(
            {"technique": "Jumpthrow + LMB", "confidence": "high",
             "reasoning": "x"},
        )
        assert result.success is True
        assert result.confidence is None
        # Both the malformed-score signal AND the resulting gate drop are
        # surfaced as structured codes — never a silent fact.
        assert "invalid_confidence:high" in result.error_codes
        assert "technique_no_confidence" in result.error_codes
        assert result.technique is None

    @pytest.mark.asyncio
    async def test_confidence_clamped(self):
        result, _ = await _call(
            {"technique": "Run + RMB", "confidence": 1.7, "reasoning": "x"},
        )
        assert result.confidence == pytest.approx(1.0)
        assert result.technique == "Run + RMB"

    @pytest.mark.asyncio
    async def test_long_technique_truncated_to_80(self):
        long_tech = "Jumpthrow + LMB " * 10  # 160 chars
        result, _ = await _call(
            {"technique": long_tech, "confidence": 0.9, "reasoning": "x"},
        )
        assert result.technique is not None
        assert len(result.technique) == 80

    @pytest.mark.asyncio
    async def test_non_string_technique_rejected(self):
        result, _ = await _call(
            {"technique": 42, "confidence": 0.9, "reasoning": "x"},
        )
        assert result.success is True
        assert result.technique is None
        assert any(
            c.startswith("invalid_technique_type:") for c in result.error_codes
        )

    @pytest.mark.asyncio
    async def test_empty_string_technique_becomes_none(self):
        result, _ = await _call(
            {"technique": "   ", "confidence": 0.9, "reasoning": "x"},
        )
        assert result.success is True
        assert result.technique is None
        assert result.error_codes == []


class TestThrowTechniqueErrorHandling:
    @pytest.mark.asyncio
    async def test_missing_api_key(self):
        with patch(_PATCH_SETTINGS) as mock_settings:
            mock_settings.anthropic_api_key = ""
            result = await classify_throw_technique_from_frames(
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
            result = await classify_throw_technique_from_frames(
                frames=[],
                frame_timestamps=[],
                chapter_title="x",
                chapter_duration=10.0,
            )
        assert result.success is False
        assert result.error_codes == ["no_frames"]

    @pytest.mark.asyncio
    async def test_frame_timestamp_length_mismatch(self):
        with patch(_PATCH_SETTINGS) as mock_settings:
            mock_settings.anthropic_api_key = "sk-test"
            result = await classify_throw_technique_from_frames(
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
            result = await classify_throw_technique_from_frames(
                frames=[_FAKE_PNG],
                frame_timestamps=[1.0],
                chapter_title="x",
                chapter_duration=10.0,
            )
        assert result.success is False
        assert result.error_codes == ["json_parse_error"]
