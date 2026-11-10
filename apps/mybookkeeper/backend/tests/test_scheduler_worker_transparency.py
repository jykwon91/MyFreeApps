"""The transparency cost sync runs in the single scheduler worker, not the API.

The API runs one process per uvicorn worker, so a sync started from its
lifespan ran once per process. These tests pin the replacement: the scheduler
worker syncs on its first tick and then once per daily slot (not every tick),
retries a failed sync on the next tick, runs only on the primary, never lets
the sync and the rest of the tick block each other, and initialises Sentry
and fails loud at boot when the shared bucket isn't configured. That the API
no longer runs a sync is enforced by
``test_app_conformance.py::TestTransparencyPrimaryWiring``.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from platform_shared.core.boot_guards import TransparencyNotConfiguredError
from platform_shared.services.transparency import cost_sync

from app.core.config import settings
from app.workers import scheduler_worker

_WORKER = "app.workers.scheduler_worker"


def _utc(day: int, hour: int, minute: int = 0) -> _dt.datetime:
    return _dt.datetime(2026, 6, day, hour, minute, tzinfo=_dt.timezone.utc)


def _stop_after_waits(stop: asyncio.Event, waits: int) -> AsyncMock:
    """A ``wait_or_stop`` stand-in that returns at once and sets ``stop`` on wait ``waits``."""
    remaining = iter(range(waits - 1))

    async def _wait(_stop: asyncio.Event, _timeout: float) -> None:
        if next(remaining, None) is None:
            stop.set()

    return AsyncMock(side_effect=_wait)


async def _drive(
    stop: asyncio.Event,
    ticks: int,
    *,
    wait: AsyncMock | None = None,
    full_interval_seconds: int = 86_400,
) -> None:
    """Run ``tick_until_stopped`` for ``ticks`` ticks (each tick takes ~no time)."""
    with patch(f"{_WORKER}.wait_or_stop", wait or _stop_after_waits(stop, ticks)):
        await scheduler_worker.tick_until_stopped(
            stop, full_interval_seconds=full_interval_seconds, tick_seconds=3_600,
        )


async def _run_ticks(
    clock: list[_dt.datetime], *, sync_results: list[bool] | None = None,
) -> list[bool]:
    """Drive the loop for one tick per ``clock`` entry.

    Each attempted cost sync consumes the next ``sync_results`` entry (default:
    success). Returns, per tick, whether a cost sync was attempted.
    """
    ticks = iter(clock)
    results = iter(sync_results or [])
    attempted: list[bool] = []

    async def _fake_tick(*, full_cycle: bool, transparency_sync: bool) -> bool:
        attempted.append(transparency_sync)
        return transparency_sync and next(results, True)

    with (
        patch(f"{_WORKER}._now", side_effect=lambda: next(ticks)),
        patch(f"{_WORKER}.run_tick", side_effect=_fake_tick),
    ):
        await _drive(asyncio.Event(), len(clock))
    return attempted


@pytest.fixture
def primary(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(settings, "transparency_primary", True)
    yield


class TestRunSchedulesTransparencySync:
    async def test_first_tick_then_once_per_daily_slot(self, primary: None) -> None:
        attempted = await _run_ticks([
            _utc(15, 9),       # startup catch-up
            _utc(15, 10),      # same day: not again
            _utc(15, 23),
            _utc(16, 0, 10),   # before the 00:15 slot
            _utc(16, 1, 10),   # first tick after the slot
            _utc(16, 2, 10),   # not again
        ])
        assert attempted == [True, False, False, False, True, False]

    async def test_failed_sync_retries_next_tick_then_waits_for_slot(self, primary: None) -> None:
        attempted = await _run_ticks(
            [
                _utc(15, 9),       # catch-up fails
                _utc(15, 10),      # retried, succeeds
                _utc(15, 11),      # not again today
                _utc(16, 0, 10),   # still before the next slot
                _utc(16, 1, 10),   # next slot
            ],
            sync_results=[False, True, True],
        )
        assert attempted == [True, True, False, False, True]

    async def test_never_syncs_when_not_primary(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "transparency_primary", False)
        assert await _run_ticks([_utc(15, 9), _utc(16, 1)]) == [False, False]

    async def test_crashed_tick_does_not_stop_the_loop_and_retries_sync(
        self, primary: None,
    ) -> None:
        clock = iter([_utc(15, 9), _utc(15, 10)])
        failing_tick = AsyncMock(side_effect=RuntimeError("cycle blew up"))
        with (
            patch(f"{_WORKER}._now", side_effect=lambda: next(clock)),
            patch(f"{_WORKER}.run_tick", failing_tick),
        ):
            await _drive(asyncio.Event(), 2)
        assert [c.kwargs["transparency_sync"] for c in failing_tick.await_args_list] == [
            True, True,
        ]


class TestTickCadence:
    async def test_full_cycle_only_on_the_first_tick_within_the_full_interval(self) -> None:
        tick = AsyncMock(return_value=False)
        with patch(f"{_WORKER}.run_tick", tick):
            await _drive(asyncio.Event(), 3)
        assert [c.kwargs["full_cycle"] for c in tick.await_args_list] == [True, False, False]

    async def test_full_cycle_again_once_the_full_interval_has_elapsed(self) -> None:
        tick = AsyncMock(return_value=False)
        with patch(f"{_WORKER}.run_tick", tick):
            await _drive(asyncio.Event(), 3, full_interval_seconds=0)
        assert [c.kwargs["full_cycle"] for c in tick.await_args_list] == [True, True, True]

    async def test_waits_out_the_rest_of_the_tick_interval(self) -> None:
        """Ticks start ``tick_seconds`` apart, so a slow tick doesn't push
        every later tick back (no drift)."""
        stop = asyncio.Event()
        wait = _stop_after_waits(stop, 3)
        # Per tick: the start reading, then the reading after it ran.
        clock = iter([0.0, 600.0, 3_600.0, 3_605.0, 7_200.0, 11_000.0])
        with (
            patch(f"{_WORKER}.time", SimpleNamespace(monotonic=lambda: next(clock))),
            patch(f"{_WORKER}.run_tick", AsyncMock(return_value=False)),
        ):
            await _drive(stop, 3, wait=wait)
        # 600s tick -> wait 3000s; 5s tick -> 3595s; a tick longer than the
        # interval -> no wait at all.
        assert [c.args[1] for c in wait.await_args_list] == [3_000.0, 3_595.0, 0.0]

    async def test_a_failing_tick_never_exits_the_worker(self) -> None:
        """A restart would re-run the full Gmail sync and the cost sync, so
        the loop survives any number of failing ticks."""
        tick = AsyncMock(side_effect=RuntimeError("still broken"))
        with patch(f"{_WORKER}.run_tick", tick):
            await _drive(asyncio.Event(), 10)
        assert tick.await_count == 10


@contextmanager
def _tick_deps(*, reminders: AsyncMock, sync: AsyncMock) -> Iterator[None]:
    with (
        patch.object(cost_sync, "run_cost_sync", sync),
        patch(f"{_WORKER}.rent_reminder_dispatch_service.run_tick", reminders),
    ):
        yield


class TestRunTick:
    async def test_reminders_run_before_the_sync(self) -> None:
        order: list[str] = []
        reminders = AsyncMock(side_effect=lambda: order.append("reminders"))
        sync = AsyncMock(side_effect=lambda _settings: order.append("sync"))
        with _tick_deps(reminders=reminders, sync=sync):
            ok = await scheduler_worker.run_tick(full_cycle=False, transparency_sync=True)
        assert ok is True
        assert order == ["reminders", "sync"]

    async def test_failed_sync_reports_false_after_reminders_ran(self) -> None:
        reminders = AsyncMock()
        sync = AsyncMock(side_effect=RuntimeError("anthropic down"))
        with _tick_deps(reminders=reminders, sync=sync):
            ok = await scheduler_worker.run_tick(full_cycle=False, transparency_sync=True)
        assert ok is False
        sync.assert_awaited_once_with(settings)
        reminders.assert_awaited_once()

    async def test_failed_cycle_still_runs_the_sync(self) -> None:
        reminders = AsyncMock(side_effect=RuntimeError("db down"))
        sync = AsyncMock()
        with _tick_deps(reminders=reminders, sync=sync):
            ok = await scheduler_worker.run_tick(full_cycle=False, transparency_sync=True)
        assert ok is True
        sync.assert_awaited_once_with(settings)

    async def test_sync_skipped_when_not_due(self) -> None:
        sync = AsyncMock()
        with _tick_deps(reminders=AsyncMock(), sync=sync):
            ok = await scheduler_worker.run_tick(full_cycle=False, transparency_sync=False)
        assert ok is False
        sync.assert_not_awaited()

    async def test_full_cycle_runs_the_sync_cycle_before_reminders(self) -> None:
        order: list[str] = []
        cycle = AsyncMock(side_effect=lambda: order.append("cycle"))
        reminders = AsyncMock(side_effect=lambda: order.append("reminders"))
        with (
            _tick_deps(reminders=reminders, sync=AsyncMock()),
            patch(f"{_WORKER}.run_sync_cycle", cycle),
        ):
            await scheduler_worker.run_tick(full_cycle=True, transparency_sync=False)
        assert order == ["cycle", "reminders"]


@pytest.fixture
def heartbeat(tmp_path: Path) -> Iterator[Path]:
    path = tmp_path / "hb"
    with (
        patch(f"{_WORKER}.HEARTBEAT_PATH", path),
        patch(f"{_WORKER}.engine", MagicMock(dispose=AsyncMock())),
    ):
        yield path


class TestBoot:
    async def test_primary_without_shared_storage_fails_loud_in_production(
        self, primary: None, heartbeat: Path, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "environment", "production")
        monkeypatch.setattr(settings, "minio_endpoint", "")
        fake_tick = AsyncMock(return_value=False)
        sentry = MagicMock()
        with (
            patch(f"{_WORKER}.init_sentry", sentry),
            patch(f"{_WORKER}.run_tick", fake_tick),
            pytest.raises(TransparencyNotConfiguredError, match="MINIO_ENDPOINT"),
        ):
            await scheduler_worker.run_scheduler(asyncio.Event())
        sentry.assert_called_once_with()
        fake_tick.assert_not_awaited()
        assert not heartbeat.exists(), "a worker that failed its boot guard must never look healthy"

    async def test_initialises_sentry_before_the_loop(self, heartbeat: Path) -> None:
        order: list[str] = []
        sentry = MagicMock(side_effect=lambda: order.append("sentry"))

        async def _tick(*, full_cycle: bool, transparency_sync: bool) -> bool:
            order.append("tick")
            return False

        stop = asyncio.Event()
        with (
            patch(f"{_WORKER}.init_sentry", sentry),
            patch(f"{_WORKER}.run_tick", side_effect=_tick),
            patch(f"{_WORKER}.wait_or_stop", _stop_after_waits(stop, 1)),
        ):
            await scheduler_worker.run_scheduler(stop)
        assert order == ["sentry", "tick"]
