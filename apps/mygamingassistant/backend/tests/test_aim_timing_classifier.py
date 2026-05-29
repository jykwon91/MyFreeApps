"""Unit tests for classify_aim_timing_from_frames (PR following #763).

All Anthropic SDK calls are mocked. This is a SEPARATE code path from the
throw-timing / stand-timing classifiers — it takes frames directly (no
DB, no reference data), so these tests need no database fixtures.
Verifies:
  - happy path: has_aim_demonstration True with valid aim_index
  - has_aim_demonstration False → aim_index null, still success
  - out-of-range indices nulled (shared _validate_grid_index)
  - confidence clamped; invalid confidence becomes structured code
  - frame labels carry the load-bearing timestamp (Frame i (t=..s):)
  - error handling: missing key, no frames, length mismatch, API + parse fail
  - prompt-presence guards for the AIM-specific blocks (locked aim,
    utility-in-hand-ready, EXCLUSIONS for stand-wide and mid-windup)

Mirrors :mod:`test_throw_timing_classifier` structurally; the AIM
classifier is the third member of the timing-classifier family (throw /
stand / aim).
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from app.services.classification.aim_timing_classifier import (
    classify_aim_timing_from_frames,
)

_FAKE_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

_PATCH_SETTINGS = "app.services.classification.aim_timing_classifier.settings"
_PATCH_ANTHROPIC = "app.services.classification.aim_timing_classifier.anthropic.Anthropic"


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
        result = await classify_aim_timing_from_frames(
            frames=frames,
            frame_timestamps=timestamps,
            chapter_title=kwargs.get("chapter_title", "B-site smoke"),
            chapter_duration=kwargs.get("chapter_duration", 30.0),
        )
    return result, mock_client


class TestAimTimingHappyPath:
    @pytest.mark.asyncio
    async def test_valid_aim_index(self):
        result, _ = await _call(
            {
                "has_aim_demonstration": True,
                "aim_index": 3,
                "confidence": 0.82,
                "reasoning": "Crosshair locked on antenna; smoke in hand frame 3.",
            }
        )
        assert result.success is True
        assert result.has_aim_demonstration is True
        assert result.aim_index == 3
        assert result.confidence == pytest.approx(0.82)
        assert result.error_codes == []

    @pytest.mark.asyncio
    async def test_frame_labels_include_timestamp(self):
        """The timestamp in the frame label is load-bearing — the caller maps
        the returned index back to seconds via the same timestamp list."""
        _, client = await _call(
            {"has_aim_demonstration": True, "aim_index": 1,
             "confidence": 0.6, "reasoning": "x"},
            timestamps=[10.0, 12.5, 14.0, 16.0, 18.0, 20.0],
        )
        content = client.messages.create.call_args.kwargs["messages"][0]["content"]
        texts = [b["text"] for b in content if b["type"] == "text"]
        assert "Frame 1 (t=10.0s):" in texts
        assert "Frame 2 (t=12.5s):" in texts

    @pytest.mark.asyncio
    async def test_system_prompt_is_cache_controlled(self):
        _, client = await _call(
            {"has_aim_demonstration": True, "aim_index": 1,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        assert system[0]["cache_control"] == {"type": "ephemeral"}


class TestAimTimingVerdictAndParser:
    @pytest.mark.asyncio
    async def test_no_aim_demo_nulls_index(self):
        """Some chapters skip the aim demo — has_aim_demonstration=False is
        a confident success answer (high confidence on the negative), NOT
        a parse error."""
        result, _ = await _call(
            {
                "has_aim_demonstration": False,
                "aim_index": None,
                "confidence": 0.85,
                "reasoning": "Narrator walks up and immediately throws; no aim demo.",
            }
        )
        assert result.success is True
        assert result.has_aim_demonstration is False
        assert result.aim_index is None
        assert result.confidence == pytest.approx(0.85)
        # error_codes empty on a confident "no demo" verdict.
        assert result.error_codes == []

    @pytest.mark.asyncio
    async def test_out_of_range_aim_index_nulled(self):
        result, _ = await _call(
            {
                "has_aim_demonstration": True,
                "aim_index": 99,  # n=6 → out of range
                "confidence": 0.7,
                "reasoning": "x",
            }
        )
        assert result.success is True
        # Out-of-range index gets nulled by the shared validator, but
        # has_aim_demonstration stays True — the localizer fallback will
        # surface this as a missing aim_index.
        assert result.aim_index is None

    @pytest.mark.asyncio
    async def test_confidence_clamped(self):
        result, _ = await _call(
            {"has_aim_demonstration": True, "aim_index": 1,
             "confidence": 1.7, "reasoning": "x"},
        )
        assert result.confidence == pytest.approx(1.0)

    @pytest.mark.asyncio
    async def test_invalid_confidence_dropped_to_none(self):
        result, _ = await _call(
            {"has_aim_demonstration": True, "aim_index": 1,
             "confidence": "high", "reasoning": "x"},
        )
        assert result.success is True
        assert result.confidence is None
        # Surfaced as a structured code, not silently dropped.
        assert "invalid_confidence:high" in result.error_codes


class TestAimTimingErrorHandling:
    @pytest.mark.asyncio
    async def test_missing_api_key(self):
        with patch(_PATCH_SETTINGS) as mock_settings:
            mock_settings.anthropic_api_key = ""
            result = await classify_aim_timing_from_frames(
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
            result = await classify_aim_timing_from_frames(
                frames=[],
                frame_timestamps=[],
                chapter_title="x",
                chapter_duration=10.0,
            )
        assert result.success is False
        assert result.error_codes == ["no_frames"]

    @pytest.mark.asyncio
    async def test_frame_timestamp_length_mismatch(self):
        """A misaligned frame/timestamp pair would silently misalign the
        returned aim_index → wrong AIM anchor. Must fail loud."""
        with patch(_PATCH_SETTINGS) as mock_settings:
            mock_settings.anthropic_api_key = "sk-test"
            result = await classify_aim_timing_from_frames(
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
            result = await classify_aim_timing_from_frames(
                frames=[_FAKE_PNG],
                frame_timestamps=[1.0],
                chapter_title="x",
                chapter_duration=10.0,
            )
        assert result.success is False
        assert result.error_codes == ["json_parse_error"]


class TestAimTimingPromptShape:
    """Prompt-presence tests for the AIM-specific instruction blocks.

    The AIM classifier must include the CANDIDATE-FRAME EXCLUSIONS block
    distinguishing aim-demo frames from stand-wide-framings and from
    mid-windup transitions. If a refactor accidentally drops any of these
    blocks, fail loud here.
    """

    @pytest.mark.asyncio
    async def test_system_prompt_includes_locked_aim_language(self):
        _, client = await _call(
            {"has_aim_demonstration": True, "aim_index": 1,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        # The "LOCKED AIM" / "PRE-WINDUP" language is what differentiates
        # this prompt from the throw-timing prompt (which looks for the
        # release frame, not the pre-release locked aim).
        assert "LOCKED AIM" in system_text
        assert "PRE-WINDUP" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_includes_candidate_exclusions(self):
        _, client = await _call(
            {"has_aim_demonstration": True, "aim_index": 1,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "CANDIDATE-FRAME EXCLUSIONS" in system_text
        # MID-WINDUP exclusion is the load-bearing one — the operator
        # complaint was the clip showed the END of the throw animation.
        assert "MID-WINDUP" in system_text
        # STAND-LOCATION exclusion distinguishes AIM from STAND.
        assert "STAND-LOCATION-CENTERED" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_anchors_on_last_settled_beat_before_throw(self):
        """STRUCTURAL ANCHOR — LAST SETTLED BEAT BEFORE THE THROW MOTION —
        is the 2026-05-31 operator spec that supersedes the 2026-05-25
        'crosshair lock-on instant / middle-of-longest-segment' rule. The
        AIM frame is now the LATEST settled beat before the throw motion
        (windup, jump, OR strafe) begins, and the 1s clip is END-ANCHORED
        on the pick so it can never bleed into windup → release → flight →
        landing. Jump- and strafe-throws DECOUPLE the aim from the release
        (the thrower lines up first, then moves while throwing), so the
        anchor must NOT be derived from release_ts. When multiple demos
        exist, the pick is the demonstration ACTUALLY THROWN, not the
        longest contiguous lock segment."""
        _, client = await _call(
            {"has_aim_demonstration": True, "aim_index": 1,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "STRUCTURAL ANCHOR" in system_text
        assert "LAST SETTLED BEAT BEFORE THE THROW MOTION" in system_text
        # End-anchoring is what makes picking the LATEST settled frame safe:
        # the clip runs [pick − 1.0s, pick] and never extends into the throw.
        assert "END-ANCHORED" in system_text
        # Jump/strafe decoupling is the load-bearing new concept — the aim can
        # be seconds before release and is NOT derivable from it.
        assert "JUMP-THROWS AND STRAFE-THROWS" in system_text
        assert "DECOUPLED from release" in system_text
        # Multiple-demos now resolves to the demo ACTUALLY THROWN (the prior
        # rule preferred the longest contiguous lock segment — reversed here).
        assert "ACTUALLY THROWN" in system_text
        assert "windup" in system_text.lower()

    @pytest.mark.asyncio
    async def test_system_prompt_includes_utility_in_ready_pose(self):
        """The prompt should keep the utility-in-ready-pose cue (now ranked
        as NEUTRAL when absent — the camera-up case can hide hands) AND
        the KNIFE-IN-HAND exclusion that distinguishes knife-only walk-up
        frames from utility-out aim frames."""
        _, client = await _call(
            {"has_aim_demonstration": True, "aim_index": 1,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        # Ready-pose cue still present (downgraded to cue #6 but kept) and
        # the KNIFE-IN-HAND exclusion is the regression backstop for the
        # 7bd971c3 misread.
        assert "READY" in system_text.upper()
        assert "KNIFE-IN-HAND" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_includes_game_visual_cues(self):
        """``_GAME_VISUAL_CUES`` must be injected so the model can read HUD
        cues to identify which game and what utility is in hand."""
        _, client = await _call(
            {"has_aim_demonstration": True, "aim_index": 1,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "HOW TO IDENTIFY THE GAME FROM THE SCREEN" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_includes_knife_and_chapter_intro_blocks(self):
        """Regression lock for 7bd971c3 ("Market Window - B Site", 2026-05-24):
        Claude misread a karambit knife as a smoke grenade in F3 of the coarse
        window AND was biased into picking an intro-overlay frame because the
        overlay text matched the chapter title. Two prompt sections counter
        both biases:
          - NON-UTILITY HELD-WEAPON DISAMBIGUATION (game/skin-agnostic
            generalization of the original KNIFE DISAMBIGUATION block)
          - CHAPTER-INTRO PHASE EXCLUSION (creator-agnostic generalization
            of the original CHAPTER-INTRO EXCLUSION block)
        If a future refactor drops either heading, fail CI here."""
        _, client = await _call(
            {"has_aim_demonstration": True, "aim_index": 1,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "NON-UTILITY HELD-WEAPON DISAMBIGUATION" in system_text
        assert "CHAPTER-INTRO PHASE EXCLUSION" in system_text
        # Crosshair-on-landmark must be ranked as the PRIMARY positive cue
        # so the model doesn't require hands-in-frame to accept aim demos
        # where the narrator has tilted the camera up at a sky/tower target.
        assert "PRIMARY" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_includes_concrete_anchored_examples(self):
        """Regression lock for the post-#768 quality drop (2026-05-24/25):
        PR #768 abstracted the prompt to game/creator-agnostic language but
        STRIPPED OUT all concrete pattern anchors (knife names, overlay-text
        shapes). Re-backfilling 7bd971c3 the next day slid Claude back into
        a walk-up frame (~261s vs the previously-good ~266s). The fix re-adds
        concrete examples marked NON-EXHAUSTIVE so Claude has a token-level
        pattern to match while the rule stays game-agnostic. If a future
        refactor drops the anchors again, fail CI here."""
        _, client = await _call(
            {"has_aim_demonstration": True, "aim_index": 1,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        # Knife-name anchors — CS2 karambit and Valorant Reaver are the
        # two highest-coverage examples per game.
        assert "karambit" in system_text.lower()
        assert "Reaver" in system_text
        # Anti-overfitting guard: examples must be explicitly tagged
        # NON-EXHAUSTIVE so Claude doesn't reject novel knife skins.
        assert "NON-EXHAUSTIVE" in system_text
        # Format-variance guard for chapter-intro overlay text.
        assert "VARIES BY CREATOR" in system_text
