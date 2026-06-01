"""Unit tests for platform_shared.services.transparency.scheduler (asyncio loop).

Confirms primary-only gating, the next-run-time math, startup catch-up,
idempotent start, clean cancellation, and that one failed run never tears
down the loop.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from platform_shared.services.transparency import cost_sync, scheduler
from platform_shared.services.transparency.scheduler import (
    _run_once,
    _seconds_until_next_run,
    maybe_start_transparency_sync,
    stop_transparency_sync,
)


@pytest.fixture(autouse=True)
def _reset_task():
    """Clear the module singleton around each test (tasks live in per-test loops)."""
    scheduler._task = None
    yield
    scheduler._task = None


def _settings(*, primary: bool) -> SimpleNamespace:
    return SimpleNamespace(transparency_primary=primary)


class TestNextRunMath:
    def test_before_daily_slot(self) -> None:
        # 00:00 → next 00:15 is 900s away.
        now = datetime(2026, 6, 15, 0, 0, 0, tzinfo=timezone.utc)
        assert _seconds_until_next_run(now) == 900

    def test_after_daily_slot_rolls_to_next_day(self) -> None:
        # 00:20 → next 00:15 is tomorrow: 24h - 5min = 86100s.
        now = datetime(2026, 6, 15, 0, 20, 0, tzinfo=timezone.utc)
        assert _seconds_until_next_run(now) == 86100

    def test_midday(self) -> None:
        # 12:15 → next 00:15 is 12h away = 43200s.
        now = datetime(2026, 6, 15, 12, 15, 0, tzinfo=timezone.utc)
        assert _seconds_until_next_run(now) == 43200


class TestGating:
    def test_non_primary_returns_none(self) -> None:
        assert maybe_start_transparency_sync(_settings(primary=False)) is None
        assert scheduler._task is None

    def test_missing_attr_treated_as_non_primary(self) -> None:
        assert maybe_start_transparency_sync(SimpleNamespace()) is None


class TestLifecycle:
    @pytest.mark.anyio
    async def test_primary_starts_and_runs_startup_sync(self, monkeypatch: pytest.MonkeyPatch) -> None:
        ran = asyncio.Event()
        calls: list = []

        async def _fake_sync(settings):  # noqa: ANN001
            calls.append(settings)
            ran.set()

        monkeypatch.setattr(cost_sync, "run_cost_sync", _fake_sync)
        settings = _settings(primary=True)
        task = maybe_start_transparency_sync(settings)
        assert task is not None
        await asyncio.wait_for(ran.wait(), timeout=1.0)
        assert calls == [settings]  # startup catch-up ran exactly once
        await stop_transparency_sync()
        assert scheduler._task is None

    @pytest.mark.anyio
    async def test_idempotent_returns_same_task(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _fake_sync(settings):  # noqa: ANN001
            await asyncio.sleep(0)

        monkeypatch.setattr(cost_sync, "run_cost_sync", _fake_sync)
        first = maybe_start_transparency_sync(_settings(primary=True))
        second = maybe_start_transparency_sync(_settings(primary=True))
        assert first is second
        await stop_transparency_sync()

    @pytest.mark.anyio
    async def test_stop_cancels_running_loop(self, monkeypatch: pytest.MonkeyPatch) -> None:
        started = asyncio.Event()

        async def _fake_sync(settings):  # noqa: ANN001
            started.set()

        monkeypatch.setattr(cost_sync, "run_cost_sync", _fake_sync)
        task = maybe_start_transparency_sync(_settings(primary=True))
        await asyncio.wait_for(started.wait(), timeout=1.0)
        await stop_transparency_sync()
        assert task.cancelled() or task.done()
        assert scheduler._task is None

    @pytest.mark.anyio
    async def test_stop_when_never_started_is_noop(self) -> None:
        await stop_transparency_sync()  # must not raise
        assert scheduler._task is None


class TestRunOnceSwallowsErrors:
    @pytest.mark.anyio
    async def test_run_once_runs_sync(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls: list = []

        async def _fake_sync(settings):  # noqa: ANN001
            calls.append(settings)

        monkeypatch.setattr(cost_sync, "run_cost_sync", _fake_sync)
        sentinel = SimpleNamespace(tag="s")
        await _run_once(sentinel)
        assert calls == [sentinel]

    @pytest.mark.anyio
    async def test_run_once_swallows_errors(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _boom(settings):  # noqa: ANN001
            raise RuntimeError("anthropic down")

        monkeypatch.setattr(cost_sync, "run_cost_sync", _boom)
        # Must NOT raise — the loop must survive a failed run.
        await _run_once(SimpleNamespace())
