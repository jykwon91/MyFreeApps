"""Unit tests for aim_localizer (two-stage AIM-demonstration refinement).

The orchestrator wraps ``classify_aim_timing_from_frames`` with a second
dense pass when the coarse pass cleared a refine gate. All Anthropic calls
and ffmpeg frame extraction are mocked at the orchestrator's local import
sites so the tests can pin the decision tree exactly.

Coverage:

  * ``coarse_window_timestamps``: spans pre-windup window, degenerate-
    chapter empty return.
  * ``dense_window_timestamps``: symmetric window, chapter clamping at
    both ends, degenerate-chapter empty return.
  * ``_should_refine``: every reason the coarse result blocks refinement.
  * ``localize_aim_with_refinement``: every documented stage —
    refined / coarse_only_* fallback paths / dense failure handling /
    confident "no demo" → propagated cleanly.
  * Frame-timestamp contract: when stage=refined, returned
    ``frame_timestamps`` MUST be the dense list (so the caller maps the
    dense indices correctly); when fallback, the coarse list.

The "dense can only improve, never regress" contract is the load-bearing
guarantee — same as throw_localizer / stand_localizer. Any dense-pass
failure mode returns the coarse result with the matching diagnostic stage.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.services.classification.classification_result import AimTimingResult
from app.services.ingestion.aim_localizer import (
    STAGE_COARSE_BELOW_GATE,
    STAGE_COARSE_FAILED,
    STAGE_COARSE_NO_AIM_INDEX,
    STAGE_COARSE_NO_DEMO,
    STAGE_COARSE_WINDOW_TOO_SMALL,
    STAGE_DENSE_EXTRACT_FAILED,
    STAGE_DENSE_REJECTED,
    STAGE_DENSE_WINDOW_TOO_SMALL,
    STAGE_REFINED,
    RefinedAimTiming,
    _should_refine,
    coarse_window_timestamps,
    dense_window_timestamps,
    localize_aim_with_refinement,
)
from app.services.ingestion.frame_extractor import FrameExtractionError

_MOD = "app.services.ingestion.aim_localizer"
_FAKE_VIDEO = Path("/tmp/fake.mp4")
_FAKE_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


# ---------------------------------------------------------------------------
# coarse_window_timestamps
# ---------------------------------------------------------------------------


class TestCoarseWindowTimestamps:
    def test_spans_pre_windup_window(self):
        """Coarse window covers [chapter_start, release_ts − pad]."""
        result = coarse_window_timestamps(chapter_start=0.0, release_ts=30.0)
        assert len(result) > 0
        assert result[0] >= 0.0
        # Upper bound is release_ts − _COARSE_PRE_WINDUP_PAD_SECONDS (0.6).
        assert result[-1] <= 30.0 - 0.6 + 1e-9

    def test_empty_when_release_below_chapter_start(self):
        """Release at or before chapter_start + pad → no usable window."""
        # release < chapter_start: trivially empty.
        result = coarse_window_timestamps(chapter_start=30.0, release_ts=10.0)
        assert result == []

    def test_empty_when_window_collapses_to_pad(self):
        """release_ts at chapter_start (or within the pad) → empty."""
        result = coarse_window_timestamps(chapter_start=10.0, release_ts=10.5)
        # release_ts - pad = 10.5 - 0.6 = 9.9, which is < chapter_start=10.0
        # → degenerate, empty.
        assert result == []


# ---------------------------------------------------------------------------
# dense_window_timestamps
# ---------------------------------------------------------------------------


class TestDenseWindowTimestamps:
    def test_returns_n_timestamps_centred_on_coarse_aim_ts(self):
        """Symmetric ±1.5s window around the coarse aim_ts, n=8 frames."""
        result = dense_window_timestamps(
            coarse_aim_ts=20.0,
            chapter_start=0.0,
            release_ts=100.0,
        )
        assert len(result) == 8
        # Window spans [18.5, 21.5] — strictly inside, edge_padding=0.
        assert result[0] == pytest.approx(18.5)
        assert result[-1] == pytest.approx(21.5)
        # Symmetric: aim_ts is the midpoint of the window.
        midpoint = (result[0] + result[-1]) / 2.0
        assert midpoint == pytest.approx(20.0)

    def test_clamps_to_chapter_start(self):
        """A coarse aim_ts near chapter_start can't sample pre-chapter."""
        result = dense_window_timestamps(
            coarse_aim_ts=10.5,  # 10.5 - 1.5 = 9.0, below start
            chapter_start=10.0,
            release_ts=100.0,
        )
        assert result[0] >= 10.0  # never below chapter_start
        assert result[0] == pytest.approx(10.0)

    def test_clamps_to_release_minus_pad(self):
        """A coarse aim_ts near release_ts can't sample post-pad-cutoff."""
        result = dense_window_timestamps(
            coarse_aim_ts=29.5,  # 29.5 + 1.5 = 31.0, above release - pad
            chapter_start=0.0,
            release_ts=30.0,
        )
        # Upper bound is release_ts - 0.6 = 29.4 — never crosses windup.
        assert result[-1] <= 29.4 + 1e-9

    def test_empty_when_window_collapses(self):
        """Degenerate / inverted bounds → empty list (caller falls back)."""
        result = dense_window_timestamps(
            coarse_aim_ts=50.0,
            chapter_start=60.0,
            release_ts=50.0,
        )
        assert result == []


# ---------------------------------------------------------------------------
# _should_refine
# ---------------------------------------------------------------------------


def _coarse(**overrides) -> AimTimingResult:
    base = dict(
        success=True,
        has_aim_demonstration=True,
        aim_index=4,
        confidence=0.72,
        reasoning="x",
    )
    base.update(overrides)
    return AimTimingResult(**base)


class TestShouldRefine:
    def test_none_means_refine(self):
        assert _should_refine(_coarse()) is None

    def test_coarse_api_failure_blocks(self):
        assert (
            _should_refine(_coarse(success=False, error_codes=["x"]))
            == STAGE_COARSE_FAILED
        )

    def test_no_demo_blocks(self):
        """A confident "no demo" verdict is a SUCCESS — caller propagates
        it (skips the AIM clip and shows the still) rather than refining."""
        assert (
            _should_refine(
                _coarse(has_aim_demonstration=False, aim_index=None)
            )
            == STAGE_COARSE_NO_DEMO
        )

    def test_missing_aim_index_blocks(self):
        assert _should_refine(_coarse(aim_index=None)) == STAGE_COARSE_NO_AIM_INDEX

    def test_confidence_below_gate_blocks(self):
        assert _should_refine(_coarse(confidence=0.54)) == STAGE_COARSE_BELOW_GATE

    def test_confidence_at_gate_refines(self):
        """The gate is >= 0.55, not > 0.55 — exact match passes."""
        assert _should_refine(_coarse(confidence=0.55)) is None

    def test_none_confidence_blocks(self):
        """A null confidence is below ANY numeric gate by definition."""
        assert _should_refine(_coarse(confidence=None)) == STAGE_COARSE_BELOW_GATE


# ---------------------------------------------------------------------------
# localize_aim_with_refinement — orchestrator decision tree
# ---------------------------------------------------------------------------


_COARSE_TIMESTAMPS = [10.0, 12.0, 14.0, 16.0, 18.0, 20.0, 22.0, 24.0,
                      26.0, 28.0, 30.0, 32.0]
_DENSE_TIMESTAMPS = [14.0, 14.5, 15.0, 15.5, 16.0, 16.5, 17.0, 17.5]


def _patch_chain(
    *,
    coarse_classifier: AimTimingResult,
    dense_classifier: AimTimingResult | None = None,
    extract_side_effect=None,
):
    """Build the patch context for the orchestrator's chain.

    Patches at the orchestrator's local import sites (its module path).
    Extraction is one async function called twice (coarse + dense); a
    side-effect list controls per-call behavior. The classifier is one
    function called once or twice — when the orchestrator runs both
    passes, we want the second call to use ``dense_classifier``.
    """
    extract_mock = AsyncMock()
    if extract_side_effect is not None:
        extract_mock.side_effect = extract_side_effect
    else:
        extract_mock.side_effect = [
            [_FAKE_PNG] * len(_COARSE_TIMESTAMPS),
            [_FAKE_PNG] * len(_DENSE_TIMESTAMPS),
        ]

    classifier_mock = AsyncMock()
    if dense_classifier is None:
        classifier_mock.side_effect = [coarse_classifier]
    else:
        classifier_mock.side_effect = [coarse_classifier, dense_classifier]

    timestamps_mock = lambda *a, **k: list(_COARSE_TIMESTAMPS)  # noqa: E731
    dense_window_mock = lambda *a, **k: list(_DENSE_TIMESTAMPS)  # noqa: E731

    return (
        patch(f"{_MOD}.extract_frames_downscaled", extract_mock),
        patch(f"{_MOD}.classify_aim_timing_from_frames", classifier_mock),
        patch(f"{_MOD}.coarse_window_timestamps", timestamps_mock),
        patch(f"{_MOD}.dense_window_timestamps", dense_window_mock),
    ), extract_mock, classifier_mock


class TestLocalizeAimOrchestrator:
    @pytest.mark.asyncio
    async def test_refined_when_coarse_clears_gate(self):
        """Happy path: coarse confidence 0.72 + dense returns a refined
        aim_index. Result uses DENSE timing + DENSE timestamps so the
        caller's index→ts mapping is frame-accurate."""
        coarse = _coarse(aim_index=3, confidence=0.72)
        # Coarse aim_index=3 → coarse_aim_ts=14.0; dense window centred there.
        # Dense picks frame 5 → dense_aim_ts=16.0 (refined +2.0s from coarse).
        dense = _coarse(aim_index=5, confidence=0.88)
        patches, extract_mock, _ = _patch_chain(
            coarse_classifier=coarse, dense_classifier=dense
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_aim_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                release_ts=60.0,
                chapter_title="B-site smoke",
            )
        assert result.stage == STAGE_REFINED
        assert result.timing is dense
        assert result.frame_timestamps == _DENSE_TIMESTAMPS
        assert result.coarse_timing is coarse
        # Both extracts ran (coarse + dense).
        assert extract_mock.await_count == 2

    @pytest.mark.asyncio
    async def test_coarse_failed_returns_coarse(self):
        coarse = AimTimingResult(
            success=False, error_codes=["rate_limit"], reasoning="api"
        )
        patches, extract_mock, classifier_mock = _patch_chain(
            coarse_classifier=coarse
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_aim_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                release_ts=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_COARSE_FAILED
        assert result.timing is coarse
        assert result.frame_timestamps == _COARSE_TIMESTAMPS
        # Dense pass NOT triggered → only the coarse extract + classify ran.
        assert extract_mock.await_count == 1
        assert classifier_mock.await_count == 1

    @pytest.mark.asyncio
    async def test_coarse_no_demo_returns_coarse(self):
        """Confident "no demo" is a SUCCESSFUL answer — propagated upward
        so the caller skips the AIM clip + shows the still."""
        coarse = _coarse(
            has_aim_demonstration=False, aim_index=None, confidence=0.85,
        )
        patches, extract_mock, classifier_mock = _patch_chain(
            coarse_classifier=coarse
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_aim_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                release_ts=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_COARSE_NO_DEMO
        assert result.timing is coarse
        assert result.timing.has_aim_demonstration is False
        assert extract_mock.await_count == 1
        assert classifier_mock.await_count == 1

    @pytest.mark.asyncio
    async def test_coarse_no_aim_index_returns_coarse(self):
        coarse = _coarse(aim_index=None, confidence=0.7)
        patches, _, classifier_mock = _patch_chain(coarse_classifier=coarse)
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_aim_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                release_ts=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_COARSE_NO_AIM_INDEX
        assert result.timing is coarse
        assert classifier_mock.await_count == 1

    @pytest.mark.asyncio
    async def test_coarse_below_gate_returns_coarse(self):
        """0.54 just below the 0.55 refine gate — no dense pass."""
        coarse = _coarse(confidence=0.54)
        patches, _, classifier_mock = _patch_chain(coarse_classifier=coarse)
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_aim_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                release_ts=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_COARSE_BELOW_GATE
        assert result.timing is coarse
        assert classifier_mock.await_count == 1

    @pytest.mark.asyncio
    async def test_coarse_window_too_small_returns_no_demo(self):
        """Release at/before chapter_start → no pre-windup window. Returns
        a synthetic "no demo" rather than raising — this is a data-shape
        issue, not a Claude failure."""
        result = await localize_aim_with_refinement(
            _FAKE_VIDEO,
            chapter_start=30.0,
            release_ts=10.0,  # below chapter_start
            chapter_title="x",
        )
        assert result.stage == STAGE_COARSE_WINDOW_TOO_SMALL
        assert result.timing.success is True
        assert result.timing.has_aim_demonstration is False
        assert result.frame_timestamps == []

    @pytest.mark.asyncio
    async def test_dense_window_too_small_returns_coarse(self):
        """Chapter boundaries collapse the dense window — fall back."""
        coarse = _coarse(aim_index=3, confidence=0.7)
        extract_mock = AsyncMock(
            return_value=[_FAKE_PNG] * len(_COARSE_TIMESTAMPS)
        )
        classifier_mock = AsyncMock(side_effect=[coarse])
        with (
            patch(f"{_MOD}.extract_frames_downscaled", extract_mock),
            patch(f"{_MOD}.classify_aim_timing_from_frames", classifier_mock),
            patch(
                f"{_MOD}.coarse_window_timestamps",
                lambda *a, **k: list(_COARSE_TIMESTAMPS),
            ),
            patch(
                f"{_MOD}.dense_window_timestamps",
                lambda *a, **k: [14.0, 14.5],  # only 2 < 4 minimum
            ),
        ):
            result = await localize_aim_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                release_ts=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_DENSE_WINDOW_TOO_SMALL
        assert result.timing is coarse
        assert result.frame_timestamps == _COARSE_TIMESTAMPS
        # Dense extract NOT invoked because the window was too small.
        assert extract_mock.await_count == 1
        assert classifier_mock.await_count == 1

    @pytest.mark.asyncio
    async def test_dense_extract_failure_returns_coarse(self):
        """Dense pass ffmpeg failure must NEVER regress the pipeline."""
        coarse = _coarse(aim_index=3, confidence=0.7)
        extract_mock = AsyncMock()
        extract_mock.side_effect = [
            [_FAKE_PNG] * len(_COARSE_TIMESTAMPS),  # coarse OK
            FrameExtractionError(
                "boom", timestamp=14.0, returncode=1, stderr="ffmpeg lost"
            ),
        ]
        classifier_mock = AsyncMock(side_effect=[coarse])
        with (
            patch(f"{_MOD}.extract_frames_downscaled", extract_mock),
            patch(f"{_MOD}.classify_aim_timing_from_frames", classifier_mock),
            patch(
                f"{_MOD}.coarse_window_timestamps",
                lambda *a, **k: list(_COARSE_TIMESTAMPS),
            ),
            patch(
                f"{_MOD}.dense_window_timestamps",
                lambda *a, **k: list(_DENSE_TIMESTAMPS),
            ),
        ):
            result = await localize_aim_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                release_ts=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_DENSE_EXTRACT_FAILED
        assert result.timing is coarse
        assert result.frame_timestamps == _COARSE_TIMESTAMPS
        # Dense extract WAS attempted (and failed); dense classifier NEVER ran.
        assert extract_mock.await_count == 2
        assert classifier_mock.await_count == 1

    @pytest.mark.asyncio
    async def test_coarse_extract_failure_reraises(self):
        """Coarse extract failure is the caller's surface to handle —
        the orchestrator must propagate, not swallow."""
        extract_mock = AsyncMock()
        extract_mock.side_effect = FrameExtractionError(
            "boom", timestamp=10.0, returncode=1, stderr="ffmpeg lost",
        )
        classifier_mock = AsyncMock()  # never called
        with (
            patch(f"{_MOD}.extract_frames_downscaled", extract_mock),
            patch(f"{_MOD}.classify_aim_timing_from_frames", classifier_mock),
            patch(
                f"{_MOD}.coarse_window_timestamps",
                lambda *a, **k: list(_COARSE_TIMESTAMPS),
            ),
        ):
            with pytest.raises(FrameExtractionError):
                await localize_aim_with_refinement(
                    _FAKE_VIDEO,
                    chapter_start=0.0,
                    release_ts=60.0,
                    chapter_title="x",
                )
        assert classifier_mock.await_count == 0

    @pytest.mark.asyncio
    async def test_dense_classifier_api_failure_returns_coarse(self):
        coarse = _coarse(aim_index=3, confidence=0.7)
        dense_fail = AimTimingResult(
            success=False, error_codes=["api"], reasoning="x"
        )
        patches, extract_mock, classifier_mock = _patch_chain(
            coarse_classifier=coarse, dense_classifier=dense_fail
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_aim_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                release_ts=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_DENSE_REJECTED
        assert result.timing is coarse
        assert result.frame_timestamps == _COARSE_TIMESTAMPS
        assert extract_mock.await_count == 2
        assert classifier_mock.await_count == 2

    @pytest.mark.asyncio
    async def test_dense_no_demo_returns_coarse(self):
        """Dense pass might decide the dense region has no aim demo (e.g.
        sampled too tight on a transition window). Coarse already cleared
        the gate, so fall back — don't downgrade coarse's verdict."""
        coarse = _coarse(aim_index=3, confidence=0.7)
        dense_no_demo = _coarse(
            has_aim_demonstration=False, aim_index=None, confidence=0.3,
        )
        patches, _, _ = _patch_chain(
            coarse_classifier=coarse, dense_classifier=dense_no_demo
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_aim_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                release_ts=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_DENSE_REJECTED
        assert result.timing is coarse

    @pytest.mark.asyncio
    async def test_dense_no_aim_index_returns_coarse(self):
        coarse = _coarse(aim_index=3, confidence=0.7)
        dense_no_idx = _coarse(aim_index=None, confidence=0.6)
        patches, _, _ = _patch_chain(
            coarse_classifier=coarse, dense_classifier=dense_no_idx
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_aim_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                release_ts=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_DENSE_REJECTED
        assert result.timing is coarse

    @pytest.mark.asyncio
    async def test_refined_frame_timestamps_are_dense_list(self):
        """Critical invariant: stage=refined returns DENSE timestamps so
        the caller's ``timestamps[aim_index - 1]`` gives the dense
        aim time, not the coarse one. If this regresses, the clip
        anchor goes back to coarse-resolution."""
        coarse = _coarse(aim_index=3, confidence=0.7)
        dense = _coarse(aim_index=5, confidence=0.8)
        patches, _, _ = _patch_chain(
            coarse_classifier=coarse, dense_classifier=dense
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_aim_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                release_ts=60.0,
                chapter_title="x",
            )
        assert isinstance(result, RefinedAimTiming)
        assert result.frame_timestamps is not _COARSE_TIMESTAMPS
        assert result.frame_timestamps == _DENSE_TIMESTAMPS
        # And the index→ts resolution: dense.aim_index=5 → 16.0
        assert result.frame_timestamps[result.timing.aim_index - 1] == 16.0
