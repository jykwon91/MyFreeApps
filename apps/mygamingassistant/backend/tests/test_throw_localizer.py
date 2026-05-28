"""Unit tests for throw_localizer (two-stage release-frame refinement).

The orchestrator wraps ``classify_throw_timing_from_frames`` with a second
dense pass when the coarse pass cleared a refine gate. All Anthropic calls
and ffmpeg frame extraction are mocked at the orchestrator's local import
sites so the tests can pin the decision tree exactly.

Coverage:

  * ``dense_window_timestamps``: window asymmetry, chapter clamping at
    both ends, degenerate-chapter empty return.
  * ``_should_refine``: every reason the coarse result blocks refinement.
  * ``localize_throw_with_refinement``: every documented stage —
    refined / coarse_only_* fallback paths / dense failure handling.
  * Frame-timestamp contract: when stage=refined, returned
    ``frame_timestamps`` MUST be the dense list (so the caller maps the
    dense indices correctly); when fallback, the coarse list.

The "dense can only improve, never regress" contract is the load-bearing
guarantee these tests pin: any dense-pass failure mode returns the coarse
result with the matching diagnostic stage.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.services.classification.classification_result import ThrowTimingResult
from app.services.ingestion.frame_extractor import FrameExtractionError
from app.services.ingestion.throw_localizer import (
    STAGE_COARSE_BELOW_GATE,
    STAGE_COARSE_FAILED,
    STAGE_COARSE_NO_RELEASE,
    STAGE_COARSE_NOT_A_THROW,
    STAGE_DENSE_EXTRACT_FAILED,
    STAGE_DENSE_REJECTED,
    STAGE_DENSE_WINDOW_TOO_SMALL,
    STAGE_RECOVERED_FIRST_EVENT,
    STAGE_RECOVERY_EXTRACT_FAILED,
    STAGE_RECOVERY_REJECTED,
    STAGE_RECOVERY_WINDOW_TOO_SMALL,
    STAGE_REFINED,
    RefinedThrowTiming,
    _should_refine,
    dense_window_timestamps,
    localize_throw_with_refinement,
)

_MOD = "app.services.ingestion.throw_localizer"
_FAKE_VIDEO = Path("/tmp/fake.mp4")
_FAKE_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


# ---------------------------------------------------------------------------
# dense_window_timestamps
# ---------------------------------------------------------------------------


class TestDenseWindowTimestamps:
    def test_returns_n_timestamps_centered_asymmetrically_on_release(self):
        """4s asymmetric window (release - 1.0, release + 3.0) @ N=8."""
        result = dense_window_timestamps(
            coarse_release_ts=100.0,
            chapter_start=0.0,
            chapter_end=200.0,
        )
        assert len(result) == 8
        # Window spans [99.0, 103.0] — strictly inside, edge_padding=0.
        assert result[0] == pytest.approx(99.0)
        assert result[-1] == pytest.approx(103.0)
        # More post-release than pre-release coverage: release is closer
        # to the START of the window than the end.
        release_offset_from_start = 100.0 - result[0]
        release_offset_from_end = result[-1] - 100.0
        assert release_offset_from_end > release_offset_from_start

    def test_clamps_to_chapter_start(self):
        """A release near chapter_start can't sample pre-chapter frames."""
        result = dense_window_timestamps(
            coarse_release_ts=10.5,  # 10.5 - 1.0 = 9.5, below start
            chapter_start=10.0,
            chapter_end=200.0,
        )
        assert result[0] >= 10.0  # never below chapter_start
        assert result[0] == pytest.approx(10.0)

    def test_clamps_to_chapter_end(self):
        """A release near chapter_end can't sample post-chapter frames."""
        result = dense_window_timestamps(
            coarse_release_ts=99.0,  # 99.0 + 3.0 = 102.0, above end
            chapter_start=0.0,
            chapter_end=100.0,
        )
        assert result[-1] <= 100.0  # never above chapter_end
        assert result[-1] == pytest.approx(100.0)

    def test_empty_when_window_collapses(self):
        """Degenerate / inverted chapter → empty list (caller falls back)."""
        result = dense_window_timestamps(
            coarse_release_ts=50.0,
            chapter_start=60.0,
            chapter_end=50.0,
        )
        assert result == []


# ---------------------------------------------------------------------------
# _should_refine
# ---------------------------------------------------------------------------


def _coarse(**overrides) -> ThrowTimingResult:
    base = dict(
        success=True,
        is_lineup_throw=True,
        release_index=4,
        result_index=6,
        confidence=0.72,
        reasoning="x",
    )
    base.update(overrides)
    return ThrowTimingResult(**base)


class TestShouldRefine:
    def test_none_means_refine(self):
        assert _should_refine(_coarse()) is None

    def test_coarse_api_failure_blocks(self):
        assert (
            _should_refine(_coarse(success=False, error_codes=["x"]))
            == STAGE_COARSE_FAILED
        )

    def test_not_a_throw_blocks(self):
        assert (
            _should_refine(
                _coarse(is_lineup_throw=False, release_index=None, result_index=None)
            )
            == STAGE_COARSE_NOT_A_THROW
        )

    def test_missing_release_index_blocks(self):
        assert _should_refine(_coarse(release_index=None)) == STAGE_COARSE_NO_RELEASE

    def test_confidence_below_gate_blocks(self):
        assert _should_refine(_coarse(confidence=0.54)) == STAGE_COARSE_BELOW_GATE

    def test_confidence_at_gate_refines(self):
        """The gate is >= 0.55, not > 0.55 — exact match passes."""
        assert _should_refine(_coarse(confidence=0.55)) is None

    def test_none_confidence_blocks(self):
        """A null confidence is below ANY numeric gate by definition."""
        assert _should_refine(_coarse(confidence=None)) == STAGE_COARSE_BELOW_GATE


# ---------------------------------------------------------------------------
# localize_throw_with_refinement — orchestrator decision tree
# ---------------------------------------------------------------------------


_COARSE_TIMESTAMPS = [10.0, 12.0, 14.0, 16.0, 18.0, 20.0, 22.0, 24.0,
                      26.0, 28.0, 30.0, 32.0]
_DENSE_TIMESTAMPS = [14.0, 14.5, 15.0, 15.5, 16.0, 16.5, 17.0, 17.5]


def _patch_chain(
    *,
    coarse_classifier: AsyncMock,
    dense_classifier: AsyncMock | None = None,
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
        # Default: both extracts succeed and return distinct frame lists
        # (so the test can assert which list reached the classifier).
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
        patch(f"{_MOD}.classify_throw_timing_from_frames", classifier_mock),
        patch(f"{_MOD}.clip_window_timestamps", timestamps_mock),
        patch(f"{_MOD}.dense_window_timestamps", dense_window_mock),
    ), extract_mock, classifier_mock


class TestLocalizeThrowOrchestrator:
    @pytest.mark.asyncio
    async def test_refined_when_coarse_clears_gate(self):
        """Happy path: coarse confidence 0.72 + dense returns a refined
        release. Result uses DENSE timing + DENSE timestamps so the
        caller's index→ts mapping is frame-accurate."""
        coarse = _coarse(release_index=3, confidence=0.72)
        # Coarse release_index=3 → coarse_release_ts=14.0; dense window
        # centred there. Dense picks frame 5 → dense_release_ts=16.0
        # (refined +2.0s from the coarse pick).
        dense = _coarse(release_index=5, result_index=7, confidence=0.88)
        patches, extract_mock, _ = _patch_chain(
            coarse_classifier=coarse, dense_classifier=dense
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
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
        coarse = ThrowTimingResult(
            success=False, error_codes=["rate_limit"], reasoning="api"
        )
        patches, extract_mock, classifier_mock = _patch_chain(
            coarse_classifier=coarse
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_COARSE_FAILED
        assert result.timing is coarse
        assert result.frame_timestamps == _COARSE_TIMESTAMPS
        # Dense pass NOT triggered → only the coarse extract + classify ran.
        assert extract_mock.await_count == 1
        assert classifier_mock.await_count == 1

    @pytest.mark.asyncio
    async def test_coarse_not_a_throw_returns_coarse(self):
        coarse = _coarse(
            is_lineup_throw=False, release_index=None, result_index=None,
            confidence=0.05,
        )
        patches, extract_mock, classifier_mock = _patch_chain(
            coarse_classifier=coarse
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_COARSE_NOT_A_THROW
        assert result.timing is coarse
        assert extract_mock.await_count == 1
        assert classifier_mock.await_count == 1

    @pytest.mark.asyncio
    async def test_coarse_no_release_index_returns_coarse(self):
        coarse = _coarse(release_index=None, confidence=0.7)
        patches, _, classifier_mock = _patch_chain(coarse_classifier=coarse)
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_COARSE_NO_RELEASE
        assert result.timing is coarse
        assert classifier_mock.await_count == 1

    @pytest.mark.asyncio
    async def test_coarse_below_gate_returns_coarse(self):
        """0.54 just below the 0.55 refine gate — no dense pass."""
        coarse = _coarse(confidence=0.54)
        patches, _, classifier_mock = _patch_chain(coarse_classifier=coarse)
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_COARSE_BELOW_GATE
        assert result.timing is coarse
        assert classifier_mock.await_count == 1

    @pytest.mark.asyncio
    async def test_dense_window_too_small_returns_coarse(self):
        """Chapter boundaries collapse the dense window — fall back."""
        coarse = _coarse(release_index=3, confidence=0.7)
        # Override dense_window mock to return < _MIN_DENSE_FRAMES items.
        extract_mock = AsyncMock(
            return_value=[_FAKE_PNG] * len(_COARSE_TIMESTAMPS)
        )
        classifier_mock = AsyncMock(side_effect=[coarse])
        with (
            patch(f"{_MOD}.extract_frames_downscaled", extract_mock),
            patch(f"{_MOD}.classify_throw_timing_from_frames", classifier_mock),
            patch(
                f"{_MOD}.clip_window_timestamps",
                lambda *a, **k: list(_COARSE_TIMESTAMPS),
            ),
            patch(
                f"{_MOD}.dense_window_timestamps",
                lambda *a, **k: [14.0, 14.5],  # only 2 < 4 minimum
            ),
        ):
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
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
        coarse = _coarse(release_index=3, confidence=0.7)
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
            patch(f"{_MOD}.classify_throw_timing_from_frames", classifier_mock),
            patch(
                f"{_MOD}.clip_window_timestamps",
                lambda *a, **k: list(_COARSE_TIMESTAMPS),
            ),
            patch(
                f"{_MOD}.dense_window_timestamps",
                lambda *a, **k: list(_DENSE_TIMESTAMPS),
            ),
        ):
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
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
            patch(f"{_MOD}.classify_throw_timing_from_frames", classifier_mock),
            patch(
                f"{_MOD}.clip_window_timestamps",
                lambda *a, **k: list(_COARSE_TIMESTAMPS),
            ),
        ):
            with pytest.raises(FrameExtractionError):
                await localize_throw_with_refinement(
                    _FAKE_VIDEO,
                    chapter_start=0.0,
                    chapter_end=60.0,
                    chapter_title="x",
                )
        assert classifier_mock.await_count == 0

    @pytest.mark.asyncio
    async def test_dense_classifier_api_failure_returns_coarse(self):
        coarse = _coarse(release_index=3, confidence=0.7)
        dense_fail = ThrowTimingResult(
            success=False, error_codes=["api"], reasoning="x"
        )
        patches, extract_mock, classifier_mock = _patch_chain(
            coarse_classifier=coarse, dense_classifier=dense_fail
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_DENSE_REJECTED
        assert result.timing is coarse
        assert result.frame_timestamps == _COARSE_TIMESTAMPS
        assert extract_mock.await_count == 2
        assert classifier_mock.await_count == 2

    @pytest.mark.asyncio
    async def test_dense_not_a_throw_returns_coarse(self):
        """Dense pass might decide the dense region isn't a throw (e.g.
        sampled too tight on a non-throw frame). Coarse already cleared
        the gate, so fall back — don't downgrade coarse's verdict."""
        coarse = _coarse(release_index=3, confidence=0.7)
        dense_not_throw = _coarse(
            is_lineup_throw=False, release_index=None, result_index=None,
            confidence=0.2,
        )
        patches, _, _ = _patch_chain(
            coarse_classifier=coarse, dense_classifier=dense_not_throw
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_DENSE_REJECTED
        assert result.timing is coarse

    @pytest.mark.asyncio
    async def test_dense_no_release_returns_coarse(self):
        coarse = _coarse(release_index=3, confidence=0.7)
        dense_no_rel = _coarse(release_index=None, confidence=0.6)
        patches, _, _ = _patch_chain(
            coarse_classifier=coarse, dense_classifier=dense_no_rel
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_DENSE_REJECTED
        assert result.timing is coarse

    @pytest.mark.asyncio
    async def test_refined_frame_timestamps_are_dense_list(self):
        """Critical invariant: stage=refined returns DENSE timestamps so
        the caller's ``timestamps[release_index - 1]`` gives the dense
        release time, not the coarse one. If this regresses, the clip
        anchor goes back to coarse-resolution."""
        coarse = _coarse(release_index=3, confidence=0.7)
        dense = _coarse(release_index=5, result_index=7, confidence=0.8)
        patches, _, _ = _patch_chain(
            coarse_classifier=coarse, dense_classifier=dense
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert isinstance(result, RefinedThrowTiming)
        assert result.frame_timestamps is not _COARSE_TIMESTAMPS
        assert result.frame_timestamps == _DENSE_TIMESTAMPS
        # And the index→ts resolution: dense.release_index=5 → 16.0
        assert result.frame_timestamps[result.timing.release_index - 1] == 16.0


# ---------------------------------------------------------------------------
# Causality recovery — multi-demonstration chapters
#
# When the coarse pass reports result_index < release_index (the classifier
# preserves the original earlier index on causality_inverted_earlier_index),
# the model paired a late demo's release with an early demo's result. The
# orchestrator re-localises densely around the FIRST event BEFORE the normal
# confidence gate. These tests pin: recovery fires on the inversion signal,
# uses the recovery window's timestamps on success, and falls back to coarse
# (never regresses) on every recovery failure mode.
# ---------------------------------------------------------------------------


def _inverted_coarse(**overrides) -> ThrowTimingResult:
    """Coarse result with the multi-demo inversion signature.

    After the classifier's forcing, release_index == result_index and the
    ORIGINAL earlier index lives on causality_inverted_earlier_index. The
    low confidence mirrors the real Market Door case (the inversion is what
    craters it) — proving recovery fires ahead of the below-gate path.
    """
    base = dict(
        success=True,
        is_lineup_throw=True,
        release_index=7,
        result_index=7,
        causality_inverted_earlier_index=3,  # → _COARSE_TIMESTAMPS[2] = 14.0
        confidence=0.28,
        reasoning="result before release — multi-demo",
    )
    base.update(overrides)
    return ThrowTimingResult(**base)


class TestCausalityRecovery:
    @pytest.mark.asyncio
    async def test_inversion_recovers_first_event(self):
        """Inverted coarse + clean recovery → use the recovery result and the
        recovery window's timestamps (so the caller maps indices correctly)."""
        coarse = _inverted_coarse()
        recovered = _coarse(release_index=2, result_index=5, confidence=0.82)
        patches, extract_mock, classifier_mock = _patch_chain(
            coarse_classifier=coarse, dense_classifier=recovered
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="multi-demo smoke",
            )
        assert result.stage == STAGE_RECOVERED_FIRST_EVENT
        assert result.timing is recovered
        # Recovery window timestamps (the patched dense list), NOT coarse.
        assert result.frame_timestamps == _DENSE_TIMESTAMPS
        assert result.coarse_timing is coarse
        # recovery release_index=2 → _DENSE_TIMESTAMPS[1] = 14.5
        assert result.frame_timestamps[result.timing.release_index - 1] == 14.5
        # Two passes ran (coarse + recovery).
        assert extract_mock.await_count == 2
        assert classifier_mock.await_count == 2

    @pytest.mark.asyncio
    async def test_recovery_fires_ahead_of_below_gate(self):
        """The inverted coarse has confidence 0.28 — below the 0.55 refine
        gate. Without recovery this returns STAGE_COARSE_BELOW_GATE; recovery
        must take precedence and never fall to the gate when it succeeds."""
        coarse = _inverted_coarse(confidence=0.28)
        recovered = _coarse(release_index=3, result_index=6, confidence=0.9)
        patches, _, _ = _patch_chain(
            coarse_classifier=coarse, dense_classifier=recovered
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_RECOVERED_FIRST_EVENT
        assert result.stage != STAGE_COARSE_BELOW_GATE

    @pytest.mark.asyncio
    async def test_recovery_reinverted_falls_back_to_coarse(self):
        """A recovery pass that itself inverts means the window still spans
        more than one demo — reject and fall back to coarse."""
        coarse = _inverted_coarse()
        recovered = _coarse(
            release_index=6, result_index=6,
            causality_inverted_earlier_index=2, confidence=0.4,
        )
        patches, extract_mock, classifier_mock = _patch_chain(
            coarse_classifier=coarse, dense_classifier=recovered
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_RECOVERY_REJECTED
        assert result.timing is coarse
        assert result.frame_timestamps == _COARSE_TIMESTAMPS
        assert extract_mock.await_count == 2
        assert classifier_mock.await_count == 2

    @pytest.mark.asyncio
    async def test_recovery_not_a_throw_falls_back_to_coarse(self):
        coarse = _inverted_coarse()
        recovered = _coarse(
            is_lineup_throw=False, release_index=None, result_index=None,
            causality_inverted_earlier_index=None, confidence=0.2,
        )
        patches, _, _ = _patch_chain(
            coarse_classifier=coarse, dense_classifier=recovered
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_RECOVERY_REJECTED
        assert result.timing is coarse

    @pytest.mark.asyncio
    async def test_recovery_no_release_falls_back_to_coarse(self):
        coarse = _inverted_coarse()
        recovered = _coarse(
            release_index=None, causality_inverted_earlier_index=None,
            confidence=0.6,
        )
        patches, _, _ = _patch_chain(
            coarse_classifier=coarse, dense_classifier=recovered
        )
        with patches[0], patches[1], patches[2], patches[3]:
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_RECOVERY_REJECTED
        assert result.timing is coarse

    @pytest.mark.asyncio
    async def test_recovery_window_too_small_falls_back(self):
        """Chapter boundaries collapse the recovery window → fall back to
        coarse WITHOUT attempting a recovery extract/classify."""
        coarse = _inverted_coarse()
        extract_mock = AsyncMock(
            return_value=[_FAKE_PNG] * len(_COARSE_TIMESTAMPS)
        )
        classifier_mock = AsyncMock(side_effect=[coarse])
        with (
            patch(f"{_MOD}.extract_frames_downscaled", extract_mock),
            patch(f"{_MOD}.classify_throw_timing_from_frames", classifier_mock),
            patch(
                f"{_MOD}.clip_window_timestamps",
                lambda *a, **k: list(_COARSE_TIMESTAMPS),
            ),
            patch(
                f"{_MOD}.dense_window_timestamps",
                lambda *a, **k: [14.0, 14.5],  # only 2 < 4 minimum
            ),
        ):
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_RECOVERY_WINDOW_TOO_SMALL
        assert result.timing is coarse
        assert result.frame_timestamps == _COARSE_TIMESTAMPS
        assert extract_mock.await_count == 1  # recovery extract NOT attempted
        assert classifier_mock.await_count == 1

    @pytest.mark.asyncio
    async def test_recovery_extract_failure_falls_back(self):
        """A recovery-pass ffmpeg failure must NEVER regress the pipeline."""
        coarse = _inverted_coarse()
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
            patch(f"{_MOD}.classify_throw_timing_from_frames", classifier_mock),
            patch(
                f"{_MOD}.clip_window_timestamps",
                lambda *a, **k: list(_COARSE_TIMESTAMPS),
            ),
            patch(
                f"{_MOD}.dense_window_timestamps",
                lambda *a, **k: list(_DENSE_TIMESTAMPS),
            ),
        ):
            result = await localize_throw_with_refinement(
                _FAKE_VIDEO,
                chapter_start=0.0,
                chapter_end=60.0,
                chapter_title="x",
            )
        assert result.stage == STAGE_RECOVERY_EXTRACT_FAILED
        assert result.timing is coarse
        assert result.frame_timestamps == _COARSE_TIMESTAMPS
        assert extract_mock.await_count == 2  # recovery extract attempted
        assert classifier_mock.await_count == 1  # recovery classify NOT reached
