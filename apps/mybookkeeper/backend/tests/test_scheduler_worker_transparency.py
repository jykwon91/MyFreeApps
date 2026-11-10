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

import datetime as _dt
from collections.abc import Iterator
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from platform_shared.core.boot_guards import TransparencyNotConfiguredError
from platform_shared.services.transparency import cost_sync

from app.core.config import settings
from app.workers import scheduler_worker

_WORKER = "app.workers.scheduler_worker"


class _StopLoop(Exception):
    """Raised from the patched ``time.sleep`` to end ``run()``'s infinite loop."""


def _utc(day: int, hour: int, minute: int = 0) -> _dt.datetime:
    return _dt.datetime(2026, 6, day, hour, minute, tzinfo=_dt.timezone.utc)


def _run_ticks(
    clock: list[_dt.datetime], *, sync_results: list[bool] | None = None,
) -> list[bool]:
    """Drive ``run()`` for one tick per ``clock`` entry.

    Each attempted cost sync consumes the next ``sync_results`` entry (default:
    success). Returns, per tick, whether a cost sync was attempted.
    """
    ticks = iter(clock)
    results = iter(sync_results or [])
    sleeps_left = iter(range(len(clock) - 1))
    attempted: list[bool] = []

    def _sleep(_seconds: float) -> None:
        if next(sleeps_left, None) is None:
            raise _StopLoop

    async def _fake_tick(*, full_cycle: bool, transparency_sync: bool) -> bool:
        attempted.append(transparency_sync)
        return transparency_sync and next(results, True)

    with (
        patch(f"{_WORKER}._now", side_effect=lambda: next(ticks)),
        patch(f"{_WORKER}.time.sleep", side_effect=_sleep),
        patch(f"{_WORKER}.run_tick", side_effect=_fake_tick),
        pytest.raises(_StopLoop),
    ):
        scheduler_worker.run()
    return attempted


@pytest.fixture
def primary(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(settings, "transparency_primary", True)
    yield


class TestRunSchedulesTransparencySync:
    def test_first_tick_then_once_per_daily_slot(self, primary: None) -> None:
        attempted = _run_ticks([
            _utc(15, 9),       # startup catch-up
            _utc(15, 10),      # same day: not again
            _utc(15, 23),
            _utc(16, 0, 10),   # before the 00:15 slot
            _utc(16, 1, 10),   # first tick after the slot
            _utc(16, 2, 10),   # not again
        ])
        assert attempted == [True, False, False, False, True, False]

    def test_failed_sync_retries_next_tick_then_waits_for_slot(self, primary: None) -> None:
        attempted = _run_ticks(
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

    def test_never_syncs_when_not_primary(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "transparency_primary", False)
        assert _run_ticks([_utc(15, 9), _utc(16, 1)]) == [False, False]

    def test_crashed_tick_does_not_stop_the_loop_and_retries_sync(
        self, primary: None,
    ) -> None:
        clock = iter([_utc(15, 9), _utc(15, 10)])
        sleeps = iter([None])

        def _sleep(_seconds: float) -> None:
            if next(sleeps, _StopLoop) is _StopLoop:
                raise _StopLoop

        failing_tick = AsyncMock(side_effect=RuntimeError("engine dispose failed"))
        with (
            patch(f"{_WORKER}._now", side_effect=lambda: next(clock)),
            patch(f"{_WORKER}.time.sleep", side_effect=_sleep),
            patch(f"{_WORKER}.run_tick", failing_tick),
            pytest.raises(_StopLoop),
        ):
            scheduler_worker.run()
        assert [c.kwargs["transparency_sync"] for c in failing_tick.await_args_list] == [
            True, True,
        ]


@contextmanager
def _tick_deps(
    *, reminders: AsyncMock, sync: AsyncMock, fake_engine: MagicMock,
) -> Iterator[None]:
    with (
        patch.object(cost_sync, "run_cost_sync", sync),
        patch(f"{_WORKER}.rent_reminder_dispatch_service.run_tick", reminders),
        patch(f"{_WORKER}.engine", fake_engine),
    ):
        yield


class TestRunTick:
    @pytest.mark.asyncio
    async def test_reminders_run_before_the_sync(self) -> None:
        order: list[str] = []
        reminders = AsyncMock(side_effect=lambda: order.append("reminders"))
        sync = AsyncMock(side_effect=lambda _settings: order.append("sync"))
        fake_engine = MagicMock(dispose=AsyncMock())
        with _tick_deps(reminders=reminders, sync=sync, fake_engine=fake_engine):
            ok = await scheduler_worker.run_tick(full_cycle=False, transparency_sync=True)
        assert ok is True
        assert order == ["reminders", "sync"]
        fake_engine.dispose.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_failed_sync_reports_false_after_reminders_ran(self) -> None:
        reminders = AsyncMock()
        sync = AsyncMock(side_effect=RuntimeError("anthropic down"))
        fake_engine = MagicMock(dispose=AsyncMock())
        with _tick_deps(reminders=reminders, sync=sync, fake_engine=fake_engine):
            ok = await scheduler_worker.run_tick(full_cycle=False, transparency_sync=True)
        assert ok is False
        sync.assert_awaited_once_with(settings)
        reminders.assert_awaited_once()
        fake_engine.dispose.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_failed_cycle_still_runs_the_sync(self) -> None:
        reminders = AsyncMock(side_effect=RuntimeError("db down"))
        sync = AsyncMock()
        fake_engine = MagicMock(dispose=AsyncMock())
        with _tick_deps(reminders=reminders, sync=sync, fake_engine=fake_engine):
            ok = await scheduler_worker.run_tick(full_cycle=False, transparency_sync=True)
        assert ok is True
        sync.assert_awaited_once_with(settings)
        fake_engine.dispose.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_sync_skipped_when_not_due(self) -> None:
        sync = AsyncMock()
        with _tick_deps(
            reminders=AsyncMock(), sync=sync, fake_engine=MagicMock(dispose=AsyncMock()),
        ):
            ok = await scheduler_worker.run_tick(full_cycle=False, transparency_sync=False)
        assert ok is False
        sync.assert_not_awaited()


class TestBoot:
    def test_primary_without_shared_storage_fails_loud_in_production(
        self, primary: None, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "environment", "production")
        monkeypatch.setattr(settings, "minio_endpoint", "")
        fake_tick = AsyncMock(return_value=False)
        sentry = MagicMock()
        with (
            patch(f"{_WORKER}.init_sentry", sentry),
            patch(f"{_WORKER}.run_tick", fake_tick),
            patch(f"{_WORKER}.time.sleep", side_effect=_StopLoop),
            pytest.raises(TransparencyNotConfiguredError, match="MINIO_ENDPOINT"),
        ):
            scheduler_worker.run()
        sentry.assert_called_once_with()
        fake_tick.assert_not_awaited()

    def test_initialises_sentry_before_the_loop(self) -> None:
        sentry = MagicMock()
        with (
            patch(f"{_WORKER}.init_sentry", sentry),
            patch(f"{_WORKER}.run_tick", AsyncMock(return_value=False)),
            patch(f"{_WORKER}.time.sleep", side_effect=_StopLoop),
            pytest.raises(_StopLoop),
        ):
            scheduler_worker.run()
        sentry.assert_called_once_with()
