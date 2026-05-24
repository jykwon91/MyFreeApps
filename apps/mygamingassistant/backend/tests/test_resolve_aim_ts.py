"""Unit tests for _resolve_aim_ts (cache vs fresh path).

Sibling shape to _resolve_stand_ts. Pinned paths:
  - cache hit: lineup.aim_localized_at set → return lineup.aim_ts WITHOUT
    a Claude call.
  - fresh success with demo: AIM-localizer returns a verdict → persist
    via set_aim_localization → return the localized timestamp.
  - fresh success without demo: AIM-localizer says "no demo" → persist
    BOTH columns (aim_ts=NULL, aim_localized_at=NOW) so the next call
    hits the cache → return None with empty error_codes.
  - fresh failure (API/extract): do NOT persist; return None with
    structured error_codes so the next backfill retries.
  - persist failure but Claude succeeded: use the value this run, log
    the persist failure (next call re-localizes since no cache write).

The two paths matter for cost — every cache hit saves a Claude call,
and every persist write avoids a re-burn. The "do NOT persist on
failure" rule is what makes transient Claude / ffmpeg failures
self-heal on the next backfill.
"""
from __future__ import annotations

import types
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.services.classification.classification_result import AimTimingResult
from app.services.ingestion.aim_localizer import RefinedAimTiming
from app.services.ingestion.frame_extractor import FrameExtractionError
from app.services.ingestion.micro_clip_helpers import _resolve_aim_ts

_MOD = "app.services.ingestion.micro_clip_helpers"


def _lineup(
    *,
    aim_ts: float | None = None,
    aim_localized_at: datetime | None = None,
    chapter_title: str = "Market Window B",
):
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        aim_ts=aim_ts,
        aim_localized_at=aim_localized_at,
        chapter_title=chapter_title,
    )


def _refined(
    *,
    has_demo: bool = True,
    aim_index: int | None = 3,
    confidence: float = 0.8,
    timestamps: list[float] | None = None,
    success: bool = True,
    error_codes: list[str] | None = None,
    reasoning: str = "ok",
) -> RefinedAimTiming:
    if timestamps is None:
        timestamps = [10.0, 12.0, 14.0, 16.0, 18.0, 20.0]
    timing = AimTimingResult(
        success=success,
        has_aim_demonstration=has_demo if success else None,
        aim_index=aim_index if (success and has_demo) else None,
        confidence=confidence if success else None,
        reasoning=reasoning,
        error_codes=list(error_codes or []),
    )
    return RefinedAimTiming(
        timing=timing,
        frame_timestamps=timestamps,
        stage="refined" if success else "coarse_failed",
        coarse_timing=timing,
    )


# ---------------------------------------------------------------------------
# Cache path
# ---------------------------------------------------------------------------


class TestResolveAimTsCachePath:
    @pytest.mark.asyncio
    async def test_cache_hit_with_demo_returns_cached_ts_no_claude_call(self):
        """aim_localized_at + aim_ts set → return cached ts, never call
        the localizer."""
        db = AsyncMock()
        lineup = _lineup(
            aim_ts=42.5,
            aim_localized_at=datetime(2026, 5, 24, tzinfo=timezone.utc),
        )
        localizer_mock = AsyncMock()  # MUST NOT be awaited

        with patch(f"{_MOD}.localize_aim_with_refinement", localizer_mock):
            ts, codes, reasoning = await _resolve_aim_ts(
                db, lineup, Path("/tmp/x.mp4"),
                chapter_start=10.0, release_ts=60.0,
            )

        assert ts == pytest.approx(42.5)
        assert codes == []
        assert reasoning == ""
        localizer_mock.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_cache_hit_no_demo_returns_none(self):
        """A confirmed "no demo" verdict (aim_localized_at set, aim_ts NULL)
        propagates as ``None`` — caller skips the AIM clip."""
        db = AsyncMock()
        lineup = _lineup(
            aim_ts=None,
            aim_localized_at=datetime(2026, 5, 24, tzinfo=timezone.utc),
        )
        localizer_mock = AsyncMock()

        with patch(f"{_MOD}.localize_aim_with_refinement", localizer_mock):
            ts, codes, reasoning = await _resolve_aim_ts(
                db, lineup, Path("/tmp/x.mp4"),
                chapter_start=10.0, release_ts=60.0,
            )

        assert ts is None
        assert codes == []
        localizer_mock.assert_not_awaited()


# ---------------------------------------------------------------------------
# Fresh path: success with demo
# ---------------------------------------------------------------------------


class TestResolveAimTsFreshSuccess:
    @pytest.mark.asyncio
    async def test_fresh_success_with_demo_returns_ts_and_persists(self):
        """No cache → run localizer → persist verdict → return localized ts."""
        db = AsyncMock()
        lineup = _lineup()  # aim_localized_at = None → fresh path
        # aim_index=3 → frame_timestamps[2] = 14.0
        refined = _refined(
            aim_index=3, timestamps=[10.0, 12.0, 14.0, 16.0]
        )
        set_aim_local_mock = AsyncMock(return_value=lineup)

        with (
            patch(
                f"{_MOD}.localize_aim_with_refinement",
                AsyncMock(return_value=refined),
            ),
            patch(
                f"{_MOD}.lineup_repo.set_aim_localization",
                set_aim_local_mock,
            ),
        ):
            ts, codes, reasoning = await _resolve_aim_ts(
                db, lineup, Path("/tmp/x.mp4"),
                chapter_start=10.0, release_ts=60.0,
            )

        assert ts == pytest.approx(14.0)
        assert codes == []
        # Persist call: aim_ts=14.0 (not NULL), aim_localized_at set.
        set_aim_local_mock.assert_awaited_once()
        call = set_aim_local_mock.await_args
        assert call.kwargs["aim_ts"] == pytest.approx(14.0)
        assert call.kwargs["aim_localized_at"] is not None

    @pytest.mark.asyncio
    async def test_fresh_no_demo_persists_null_and_returns_none(self):
        """Confident "no demo" verdict still writes the cache marker
        (aim_localized_at) so the next call short-circuits — otherwise
        every backfill re-burns Claude on the same no-demo lineup."""
        db = AsyncMock()
        lineup = _lineup()
        refined = _refined(has_demo=False, aim_index=None)
        set_aim_local_mock = AsyncMock(return_value=lineup)

        with (
            patch(
                f"{_MOD}.localize_aim_with_refinement",
                AsyncMock(return_value=refined),
            ),
            patch(
                f"{_MOD}.lineup_repo.set_aim_localization",
                set_aim_local_mock,
            ),
        ):
            ts, codes, reasoning = await _resolve_aim_ts(
                db, lineup, Path("/tmp/x.mp4"),
                chapter_start=10.0, release_ts=60.0,
            )

        assert ts is None
        assert codes == []
        # Persist still called — aim_ts=NULL but aim_localized_at SET.
        set_aim_local_mock.assert_awaited_once()
        call = set_aim_local_mock.await_args
        assert call.kwargs["aim_ts"] is None
        assert call.kwargs["aim_localized_at"] is not None


# ---------------------------------------------------------------------------
# Fresh path: failure
# ---------------------------------------------------------------------------


class TestResolveAimTsFreshFailure:
    @pytest.mark.asyncio
    async def test_localizer_api_failure_does_not_persist(self):
        """A Claude API failure (rate limit, etc.) must NOT write the
        cache — the next backfill retries. Returns the structured codes."""
        db = AsyncMock()
        lineup = _lineup()
        refined = _refined(
            success=False, error_codes=["rate_limit_error"],
            reasoning="rate limited",
        )
        set_aim_local_mock = AsyncMock()  # MUST NOT be awaited

        with (
            patch(
                f"{_MOD}.localize_aim_with_refinement",
                AsyncMock(return_value=refined),
            ),
            patch(
                f"{_MOD}.lineup_repo.set_aim_localization",
                set_aim_local_mock,
            ),
        ):
            ts, codes, reasoning = await _resolve_aim_ts(
                db, lineup, Path("/tmp/x.mp4"),
                chapter_start=10.0, release_ts=60.0,
            )

        assert ts is None
        assert "rate_limit_error" in codes
        set_aim_local_mock.assert_not_awaited(), (
            "Failed Claude call must NOT write the cache — "
            "next backfill retries."
        )

    @pytest.mark.asyncio
    async def test_frame_extraction_error_returns_structured_code(self):
        """ffmpeg failure during frame extraction propagates as a
        structured ``aim_localizer_extract:rc=<n>`` code."""
        db = AsyncMock()
        lineup = _lineup()
        set_aim_local_mock = AsyncMock()  # MUST NOT be awaited

        with (
            patch(
                f"{_MOD}.localize_aim_with_refinement",
                AsyncMock(side_effect=FrameExtractionError(
                    "boom", timestamp=10.0, returncode=42, stderr="ffmpeg lost",
                )),
            ),
            patch(
                f"{_MOD}.lineup_repo.set_aim_localization",
                set_aim_local_mock,
            ),
        ):
            ts, codes, reasoning = await _resolve_aim_ts(
                db, lineup, Path("/tmp/x.mp4"),
                chapter_start=10.0, release_ts=60.0,
            )

        assert ts is None
        assert any(c.startswith("aim_localizer_extract:rc=") for c in codes)
        set_aim_local_mock.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_localizer_unexpected_raise_returns_structured_code(self):
        """Defensive Exception catch — an unexpected raise still produces
        a structured code (never bare bool, per
        rules/check-third-party-error-codes.md)."""
        db = AsyncMock()
        lineup = _lineup()

        with (
            patch(
                f"{_MOD}.localize_aim_with_refinement",
                AsyncMock(side_effect=RuntimeError("unexpected")),
            ),
            patch(
                f"{_MOD}.lineup_repo.set_aim_localization",
                AsyncMock(),
            ),
        ):
            ts, codes, reasoning = await _resolve_aim_ts(
                db, lineup, Path("/tmp/x.mp4"),
                chapter_start=10.0, release_ts=60.0,
            )

        assert ts is None
        assert any("aim_localizer_raised:RuntimeError" in c for c in codes)


class TestResolveAimTsPersistFailure:
    @pytest.mark.asyncio
    async def test_persist_failure_returns_value_anyway(self):
        """Claude call succeeded but the DB write failed — use the value
        this run, log the persist failure. Next backfill will re-localize
        (because no cache write happened) — that's the intended self-heal
        for transient DB issues."""
        db = AsyncMock()
        lineup = _lineup()
        refined = _refined(
            aim_index=3, timestamps=[10.0, 12.0, 14.0, 16.0]
        )

        with (
            patch(
                f"{_MOD}.localize_aim_with_refinement",
                AsyncMock(return_value=refined),
            ),
            patch(
                f"{_MOD}.lineup_repo.set_aim_localization",
                AsyncMock(side_effect=RuntimeError("db down")),
            ),
        ):
            ts, codes, reasoning = await _resolve_aim_ts(
                db, lineup, Path("/tmp/x.mp4"),
                chapter_start=10.0, release_ts=60.0,
            )

        # Value used this run even though persist failed.
        assert ts == pytest.approx(14.0)
        # codes EMPTY — the Claude call itself succeeded; persist failure
        # is a log line, not a structured error to surface to the caller.
        assert codes == []
