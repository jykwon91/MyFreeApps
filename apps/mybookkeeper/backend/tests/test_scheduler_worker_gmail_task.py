"""Gmail sync runs as its own task, beside the scheduler's ticks.

A sync can wait for hours (an Anthropic rate limit, the retries of emails
whose read failed). Inside the tick that wait held back every rent reminder
and lease hand-over behind it; as its own task it delays nothing.

A full cycle that finds the previous sync still running tries Gmail again
on the next tick. A slow sync is logged at info; one past a whole full
interval is logged as an error once per run; past the hard cap it is taken
as hung, cancelled and replaced. A sync task that dies is logged.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from platform_shared.extraction.backoff import throttle

from app.core.config import settings
from app.core.context import worker_context
from app.models.integrations.gmail_sync_run import GmailSyncRun
from app.models.integrations.gmail_sync_target import GmailSyncTarget
from app.services.email.email_extraction_service import drain_claude_extraction
from app.workers import scheduler_worker

_WORKER = "app.workers.scheduler_worker"
_NO_CAP = 10**9


@pytest.fixture(autouse=True)
def _no_rate_limit_left_behind(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(settings, "transparency_primary", False)
    yield
    throttle.resume_at = 0.0
    throttle.consecutive_429s = 0


def _target() -> GmailSyncTarget:
    return MagicMock(spec=GmailSyncTarget, organization_id=uuid.uuid4(), user_id=uuid.uuid4())


def _gmail_task_running() -> bool:
    return any(t.get_name() == "gmail-sync" and not t.done() for t in asyncio.all_tasks())


@contextmanager
def _scheduler(
    stop: asyncio.Event, ticks: int, sync: object, *, on_wait: Callable[[int], None] | None = None,
) -> Iterator[SimpleNamespace]:
    """Patch every tick step; ``stop`` is set on the ``ticks``-th wait. Yields the step mocks."""
    waits = 0

    async def _wait(_stop: asyncio.Event, _timeout: float) -> None:
        nonlocal waits
        waits += 1
        if on_wait is not None:
            on_wait(waits)
        await asyncio.sleep(0.01)  # the Gmail task gets the loop between ticks
        if waits == ticks:
            stop.set()

    steps = SimpleNamespace(reminders=AsyncMock(), channels=AsyncMock(return_value=0))
    with (
        patch(f"{_WORKER}.get_gmail_sync_targets", AsyncMock(return_value=[_target()])),
        patch(f"{_WORKER}.sync_gmail_connection", sync),
        patch(f"{_WORKER}.poll_all_channels", steps.channels),
        patch(f"{_WORKER}.lease_handover_service.end_replaced_leases", AsyncMock(return_value=0)),
        patch(f"{_WORKER}.utility_plan_service.sweep_plans_needing_renewal", AsyncMock(return_value=[])),
        patch(f"{_WORKER}.rent_reminder_dispatch_service.run_tick", steps.reminders),
        patch(f"{_WORKER}.wait_or_stop", side_effect=_wait),
    ):
        yield steps


async def _never_finishing_run(started_at: float, cancelled: asyncio.Event | None = None) -> GmailSyncRun:
    async def _forever() -> None:
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            if cancelled is not None:
                cancelled.set()
            raise

    task = asyncio.create_task(_forever(), name="gmail-sync")
    await asyncio.sleep(0)
    return GmailSyncRun(task=task, started_at=started_at)


async def test_reminders_run_on_time_while_the_gmail_sync_waits_out_a_rate_limit() -> None:
    throttle.resume_at = time.monotonic() + 3600
    stop = asyncio.Event()
    gmail_waiting_at_each_reminder: list[bool] = []

    async def _real_drain(target: GmailSyncTarget) -> None:
        await drain_claude_extraction(worker_context(target.organization_id, target.user_id))

    with _scheduler(stop, 3, _real_drain) as steps:
        steps.reminders.side_effect = lambda: gmail_waiting_at_each_reminder.append(_gmail_task_running())
        await asyncio.wait_for(
            scheduler_worker.tick_until_stopped(
                stop, full_interval_seconds=86_400, tick_seconds=3_600, gmail_sync_cap_seconds=_NO_CAP,
            ),
            timeout=5,
        )

    assert steps.reminders.await_count == 3
    # The first reminder ran with the sync just started; every later one while it was still waiting.
    assert gmail_waiting_at_each_reminder[1:] == [True, True]
    assert not _gmail_task_running()


async def test_a_full_cycle_leaves_a_running_gmail_sync_be_and_stop_cancels_it() -> None:
    stop = asyncio.Event()
    started = 0
    cancelled = asyncio.Event()

    async def _never_finishes(_target: GmailSyncTarget) -> None:
        nonlocal started
        started += 1
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    with _scheduler(stop, 3, _never_finishes):
        await asyncio.wait_for(
            scheduler_worker.tick_until_stopped(
                stop, full_interval_seconds=0, tick_seconds=3_600, gmail_sync_cap_seconds=_NO_CAP,
            ),
            timeout=5,
        )

    assert started == 1
    assert cancelled.is_set()
    assert not _gmail_task_running()


async def test_a_new_gmail_sync_starts_once_the_previous_one_finished() -> None:
    stop = asyncio.Event()
    sync = AsyncMock()

    with _scheduler(stop, 3, sync):
        await scheduler_worker.tick_until_stopped(
            stop, full_interval_seconds=0, tick_seconds=3_600, gmail_sync_cap_seconds=_NO_CAP,
        )

    assert sync.await_count == 3


async def test_a_declined_gmail_sync_is_tried_again_next_tick_without_rerunning_the_cycle() -> None:
    # Ticks at 0 (full: sync A starts), 100 (full: A still running, declined),
    # 150 (not full: Gmail retried, A done, B starts), 190 (nothing due).
    clock = [0.0]
    stop = asyncio.Event()
    release_first = asyncio.Event()
    calls = 0

    async def _sync(_target: GmailSyncTarget) -> None:
        nonlocal calls
        calls += 1
        if calls == 1:
            await release_first.wait()

    def _advance(waits: int) -> None:
        clock[0] = {1: 100.0, 2: 150.0, 3: 190.0}.get(waits, clock[0])
        if waits == 2:
            release_first.set()

    fake_time = SimpleNamespace(monotonic=lambda: clock[0])
    with _scheduler(stop, 4, _sync, on_wait=_advance) as steps, patch.object(scheduler_worker, "time", fake_time):
        await asyncio.wait_for(
            scheduler_worker.tick_until_stopped(
                stop, full_interval_seconds=100, tick_seconds=50, gmail_sync_cap_seconds=_NO_CAP,
            ),
            timeout=5,
        )

    assert calls == 2
    # Channels ran on the two full cycles only, not on the Gmail retry.
    assert steps.channels.await_count == 2
    assert steps.reminders.await_count == 4


def _still_running_logs(caplog: pytest.LogCaptureFixture) -> list[tuple[int, str]]:
    return [(r.levelno, r.getMessage()) for r in caplog.records if "is still running" in r.getMessage()]


async def test_a_slow_sync_is_logged_at_info_then_once_as_an_error_after_a_whole_cycle(
    caplog: pytest.LogCaptureFixture,
) -> None:
    running = await _never_finishing_run(started_at=0.0)
    sync_all = AsyncMock()
    hour = 3600.0

    with patch.object(scheduler_worker, "sync_all_gmail", sync_all), caplog.at_level(logging.INFO, logger=_WORKER):
        run = running
        # Hourly ticks: 3h (slow), 24h (overran the daily cycle), 25h and 26h (still running).
        for now in (3 * hour, 24 * hour, 25 * hour, 26 * hour):
            run, started = await scheduler_worker.start_gmail_sync(
                run, now=now, overrun_seconds=24 * hour, cap_seconds=48 * hour,
            )
            assert started is False

    assert run.task is running.task and not run.task.done()
    assert run.overrun_reported is True
    sync_all.assert_not_called()
    levels = [level for level, _ in _still_running_logs(caplog)]
    assert levels == [logging.INFO, logging.ERROR, logging.INFO, logging.INFO]
    assert "24.0 hours ago is still running, past a whole 24.0-hour cycle" in _still_running_logs(caplog)[1][1]
    running.task.cancel()
    await asyncio.gather(running.task, return_exceptions=True)


async def test_a_sync_past_the_cap_is_cancelled_and_replaced(caplog: pytest.LogCaptureFixture) -> None:
    cancelled = asyncio.Event()
    running = await _never_finishing_run(started_at=0.0, cancelled=cancelled)
    sync_all = AsyncMock()

    with patch.object(scheduler_worker, "sync_all_gmail", sync_all), caplog.at_level(logging.ERROR, logger=_WORKER):
        now_running, started = await scheduler_worker.start_gmail_sync(
            running, now=200_000.0, overrun_seconds=86_400, cap_seconds=172_800,
        )
        await now_running.task

    assert started is True
    assert cancelled.is_set() and running.task.cancelled()
    assert now_running is not running and now_running.started_at == 200_000.0
    sync_all.assert_awaited_once()
    assert any("past the 48.0-hour cap" in r.getMessage() for r in caplog.records)


async def test_a_sync_task_that_dies_is_logged(caplog: pytest.LogCaptureFixture) -> None:
    with (
        patch.object(scheduler_worker, "sync_all_gmail", AsyncMock(side_effect=RuntimeError("boom"))),
        caplog.at_level(logging.ERROR, logger=_WORKER),
    ):
        run, _ = await scheduler_worker.start_gmail_sync(None, now=0.0, overrun_seconds=_NO_CAP, cap_seconds=_NO_CAP)
        await asyncio.gather(run.task, return_exceptions=True)
        await asyncio.sleep(0)  # done callbacks run on the next loop pass

    died = [r for r in caplog.records if r.getMessage() == "The Gmail sync task died"]
    assert len(died) == 1 and died[0].exc_info is not None and str(died[0].exc_info[1]) == "boom"
