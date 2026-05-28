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

_PATCH_SETTINGS = "app.services.classification.throw_timing_classifier.settings"
_PATCH_ANTHROPIC = "app.services.classification.throw_timing_classifier.anthropic.Anthropic"


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
        """A result cannot precede its own release — parser forces equality
        AND preserves the original earlier index for causality recovery."""
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
        # The original earlier index (the first demo's result) is the
        # multi-demonstration breadcrumb the localizer recovers around.
        assert result.causality_inverted_earlier_index == 3

    @pytest.mark.asyncio
    async def test_non_inverted_result_leaves_earlier_index_none(self):
        """No inversion → no recovery breadcrumb (field stays None)."""
        result, _ = await _call(
            {
                "is_lineup_throw": True,
                "release_index": 3,
                "result_index": 5,
                "confidence": 0.7,
                "reasoning": "x",
            }
        )
        assert result.release_index == 3
        assert result.result_index == 5
        assert result.causality_inverted_earlier_index is None

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


class TestThrowTimingCandidateExclusions:
    """Prompt-presence tests for CANDIDATE-FRAME EXCLUSIONS.

    The operator's source channels heavily use title cards / "SMOKE #N"
    headers / knife-only-walking transition shots. Before this rule was
    added, those frames were either picked as RELEASE / RESULT (wrong) OR
    forced the chapter to is_lineup_throw=false (also wrong — the actual
    throw was hiding elsewhere in the window). The rule decouples
    "this individual frame can't be the release/result" from "no frame in
    this chapter shows a throw." If a refactor accidentally drops any of
    these blocks, fail loud here.
    """

    @pytest.mark.asyncio
    async def test_system_prompt_includes_candidate_exclusions_header(self):
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "CANDIDATE-FRAME EXCLUSIONS" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_excludes_title_card_frames(self):
        """Title cards / large text overlays must be called out by name —
        the operator's source channels use "SMOKE #N" headers heavily."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "TITLE-CARD" in system_text
        # The literal "SMOKE #N" example anchors the model to the operator's
        # source channel's actual overlay style.
        assert "SMOKE #N" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_excludes_knife_only_walking_frames(self):
        """Knife-only-walking frames between throws must be explicit
        non-candidates — but knife-in-hand AFTER a release while the
        utility is mid-flight is still a valid result candidate."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "KNIFE-ONLY-WALKING" in system_text
        # The post-release knife-in-hand carve-out must be present, or the
        # rule would over-exclude legitimate result frames where the
        # thrower has already switched back to a knife while the smoke
        # blooms in front of them.
        assert "mid-flight or" in system_text
        assert "blooming IS a valid result candidate" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_decouples_chapter_verdict_from_frame_exclusion(
        self,
    ):
        """is_lineup_throw=false ONLY when NO frame shows a release; a
        chapter that mixes title cards with a real throw is still
        is_lineup_throw=true. If this drops, the model will start flipping
        the verdict on any chapter that contains even one title card."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "AT LEAST ONE frame" in system_text
        assert "ineligible candidates" in system_text
        # The "NOT a verdict flip" phrase is the explicit decoupling — it's
        # the one short string that says "mixed-content chapter stays true".
        assert "NOT a verdict flip" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_directs_model_to_search_elsewhere(self):
        """When a frame is excluded, the model must look elsewhere — not
        force a pick on the excluded frame. Without this the model often
        returns its second-favorite which happens to be the title card."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "Search for a clean" in system_text
        assert "set the affected index to null" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_asks_for_exclusion_notes_in_reasoning(self):
        """When the model skips frames due to exclusions, the reasoning
        field must say which frames + which rule — this is the diagnostic
        breadcrumb that lets the operator audit the classifier's behavior
        on a known-bad lineup without re-running it."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "skipped F3 title-card" in system_text


class TestThrowTimingReleaseAnchor:
    """Prompt-presence tests for the RELEASE-INSTANT ANCHOR section.

    Per the 2026-05-25 operator audit of the dev DB's 12 lineups, 4 throw
    clips showed wrong-frame content (#1 / #5 / #6 / #10): two showed the
    bloom-onset instead of the throw arc ("ANTI-LANDING"), one ended before
    the throw happened ("ANTI-PRE-WINDUP"). The pre-audit prompt listed
    "throw-animation follow-through" as a release cue, which licenses the
    model to pick post-release frames; the audit-driven prompt demotes that
    cue and elevates HUD-slot decrement + hand-empty as the primary signals.
    If a refactor accidentally drops any of these blocks the dominant
    failure mode comes back, so fail loud here.
    """

    @pytest.mark.asyncio
    async def test_system_prompt_includes_release_instant_anchor(self):
        """The RELEASE-INSTANT ANCHOR section must establish
        UTILITY-SEPARATION + HUD-slot-decrement as the primary release
        cues. The UTILITY-SEPARATION wording (mid-swing, T4) replaced the
        original "HAND-EMPTY AFTER ARM EXTENSION" wording (post-swing,
        T5) on 2026-05-25 because the original anchored on the wrong
        biomechanical instant — see #775 follow-up."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "RELEASE-INSTANT ANCHOR" in system_text
        # Both primary cues must be present by name so the model knows which
        # signal to anchor on when the HUD is occluded.
        assert "UTILITY-SEPARATION FRAME" in system_text
        assert "HUD GRENADE-SLOT DECREMENT" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_anchors_on_mid_swing_not_post_swing(self):
        """The release instant is T4 (utility separates from hand,
        mid-swing) NOT T5 (arm fully retracted, post-swing). The first
        cut of this prompt (#775) used "the throwing arm has finished
        its forward swing and the hand is now EMPTY" wording which
        anchored on T5 and caused #11 Stairs's clip to catch only the
        tail of the throw motion (operator audit 2026-05-25). The
        replacement wording MUST explicitly distinguish mid-swing from
        post-swing or the bug returns."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        # Mid-swing positive cue
        assert "MID-SWING" in system_text
        # Explicit anti-post-swing language (substrings chosen to survive
        # source-file line wrapping — the joined system_text has newlines
        # mid-phrase where the source wraps)
        assert "NOT after the swing has completed" in system_text
        assert "FULLY RETRACTED" in system_text
        # Forecast the bug if removed: clip catches only the tail of the
        # throw motion. This phrase ties the rule to the audit so the
        # warning survives copy-edits.
        assert "tail of the throw motion" in system_text
        # The explicit identity statement is the load-bearing instruction
        # — "release instant IS separation, NOT post-swing rest"
        assert "the SEPARATION" in system_text
        assert "post-swing rest" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_demotes_follow_through_cue(self):
        """The pre-audit "throw-animation follow-through" wording was the
        suspected root cause for #1 / #6 / #10's "shows landing" failures
        — it licensed the model to pick post-release frames. The new prompt
        MUST explicitly DO-NOT-USE it as a standalone release cue. The
        follow-up (#775+1) also demotes "post-swing hand-at-rest pose"
        which was the residual T5 anchor that #11 Stairs hit."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        # The literal "DO NOT use" phrasing is the explicit demotion — if a
        # future refactor collapses the warning back into a plain bullet,
        # the model loses the anti-follow-through guard.
        assert "DO NOT use" in system_text
        assert "throw-animation follow-through" in system_text
        # Substring chosen to survive source-file line wrapping
        assert "projectile arc" in system_text
        # The post-swing demotion was added in the #775 follow-up after
        # the original wording anchored the model on T5 instead of T4.
        assert "post-swing hand-at-rest pose" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_includes_anti_landing_confusion(self):
        """The dominant audit failure mode (#1, #6): release picked at bloom
        onset instead of hand-empty. The ANTI-LANDING CONFUSION block must
        explicitly tell the model to search BACKWARD when smoke / flame /
        flash / debris is visible in the world on a candidate frame."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "ANTI-LANDING CONFUSION" in system_text
        # Specific phrasing that tells the model what to DO when it sees the
        # smoke — search backward, not just "don't pick the bloom".
        assert "Search BACKWARD" in system_text
        # The reason is load-bearing — the model needs to understand WHY
        # picking the bloom is wrong (clip shifts into result territory).
        # Substring chosen to survive source-file line wrapping.
        assert "NEVER on release_index" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_includes_anti_pre_windup(self):
        """The opposite failure mode (#5): release picked at pre-windup
        when the utility was still in hand. The ANTI-PRE-WINDUP block must
        tell the model to search FORWARD when the utility is still being
        held / charged / aimed."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "ANTI-PRE-WINDUP" in system_text
        assert "Search FORWARD" in system_text
        # The "belongs on the AIM pane" line decouples the two panes
        # explicitly — pre-windup content is AIM data, not THROW data.
        assert "AIM pane, not the THROW clip" in system_text

    @pytest.mark.asyncio
    async def test_system_prompt_includes_straddle_rule(self):
        """When the candidate set straddles release (frame N in-hand,
        frame N+1 hand-empty + bloom visible), the model must pick N+1.
        Without this rule the model can split-the-difference and return
        frame N, shifting the clip earlier than the true release."""
        _, client = await _call(
            {"is_lineup_throw": True, "release_index": 1, "result_index": 2,
             "confidence": 0.6, "reasoning": "x"},
        )
        system = client.messages.create.call_args.kwargs["system"]
        system_text = "\n".join(b["text"] for b in system)
        assert "STRADDLE RULE" in system_text
        # The clip-window justification ("1.0s of pre-release coverage") is
        # what tells the model it's safe to pick the slightly-late frame —
        # the wind-up isn't lost. Substring chosen to survive source-file
        # line wrapping.
        assert "1.0s of pre-release" in system_text
