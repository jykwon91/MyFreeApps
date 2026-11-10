"""Unit tests for platform_shared.services.transparency.scheduler.

Covers the pure "is the daily sync due" decision (startup catch-up, the
00:15 UTC slot, day and month rollover) and that ``run_cost_sync_once``
reports failure instead of raising, so a failed run never takes down the
worker loop that drives it.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from platform_shared.services.transparency import cost_sync
from platform_shared.services.transparency.scheduler import (
    is_daily_sync_due,
    run_cost_sync_once,
)


def _utc(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


class TestIsDailySyncDue:
    def test_first_run_is_always_due(self) -> None:
        assert is_daily_sync_due(last_run=None, now=_utc(2026, 6, 15, 12))

    def test_not_due_again_later_the_same_day(self) -> None:
        assert not is_daily_sync_due(
            last_run=_utc(2026, 6, 15, 9), now=_utc(2026, 6, 15, 23, 59),
        )

    def test_not_due_before_next_days_slot(self) -> None:
        # 00:10 is before the 00:15 slot — yesterday's run still covers it.
        assert not is_daily_sync_due(
            last_run=_utc(2026, 6, 15, 9), now=_utc(2026, 6, 16, 0, 10),
        )

    def test_due_once_the_slot_has_passed(self) -> None:
        assert is_daily_sync_due(
            last_run=_utc(2026, 6, 15, 9), now=_utc(2026, 6, 16, 0, 15),
        )

    def test_not_due_twice_after_running_at_the_slot(self) -> None:
        assert not is_daily_sync_due(
            last_run=_utc(2026, 6, 16, 0, 15), now=_utc(2026, 6, 16, 1, 15),
        )

    def test_run_just_before_slot_is_due_at_slot(self) -> None:
        assert is_daily_sync_due(
            last_run=_utc(2026, 6, 16, 0, 14), now=_utc(2026, 6, 16, 0, 20),
        )

    def test_due_after_month_rollover(self) -> None:
        assert is_daily_sync_due(
            last_run=_utc(2026, 6, 30, 22), now=_utc(2026, 7, 1, 1),
        )

    def test_due_after_several_missed_days(self) -> None:
        assert is_daily_sync_due(
            last_run=_utc(2026, 6, 10, 9), now=_utc(2026, 6, 15, 3),
        )

    def test_non_utc_now_is_evaluated_in_utc(self) -> None:
        # 19:20 on the 15th at UTC-5 is 00:20 UTC on the 16th: past the slot.
        minus_five = timezone(timedelta(hours=-5))
        now = datetime(2026, 6, 15, 19, 20, tzinfo=minus_five)
        assert is_daily_sync_due(last_run=_utc(2026, 6, 15, 9), now=now)
        # 19:10 at UTC-5 is 00:10 UTC: still before the slot.
        before = datetime(2026, 6, 15, 19, 10, tzinfo=minus_five)
        assert not is_daily_sync_due(last_run=_utc(2026, 6, 15, 9), now=before)

    def test_non_utc_last_run_is_evaluated_in_utc(self) -> None:
        # 20:20 on the 15th at UTC-5 is 01:20 UTC on the 16th: after today's slot.
        last_run = datetime(2026, 6, 15, 20, 20, tzinfo=timezone(timedelta(hours=-5)))
        assert not is_daily_sync_due(last_run=last_run, now=_utc(2026, 6, 16, 3))

    def test_naive_now_raises(self) -> None:
        with pytest.raises(ValueError, match="now must be timezone-aware"):
            is_daily_sync_due(last_run=None, now=datetime(2026, 6, 16, 1))

    def test_naive_last_run_raises(self) -> None:
        with pytest.raises(ValueError, match="last_run must be timezone-aware"):
            is_daily_sync_due(
                last_run=datetime(2026, 6, 15, 9), now=_utc(2026, 6, 16, 1),
            )


class TestRunCostSyncOnce:
    @pytest.mark.anyio
    async def test_runs_sync_and_reports_success(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls: list[SimpleNamespace] = []

        async def _fake_sync(settings: SimpleNamespace) -> int:
            calls.append(settings)
            return 1200

        monkeypatch.setattr(cost_sync, "run_cost_sync", _fake_sync)
        sentinel = SimpleNamespace(tag="s")
        assert await run_cost_sync_once(sentinel) is True
        assert calls == [sentinel]

    @pytest.mark.anyio
    async def test_failure_is_logged_and_reported_not_raised(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
    ) -> None:
        async def _boom(settings: SimpleNamespace) -> int:
            raise RuntimeError("anthropic down")

        monkeypatch.setattr(cost_sync, "run_cost_sync", _boom)
        assert await run_cost_sync_once(SimpleNamespace()) is False
        assert "Transparency cost sync failed" in caplog.text
