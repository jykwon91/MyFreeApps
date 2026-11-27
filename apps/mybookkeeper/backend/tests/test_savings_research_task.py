"""The scheduler's savings research task (``app/workers/savings_research_task``).

Pinned: a tick starts a sweep; a sweep still running isn't doubled; a
finished one is replaced; a failing sweep is logged, never raised; shutdown
cancels a running sweep; the scheduler loop starts one and stops it.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.workers import savings_research_task, scheduler_worker

pytestmark = pytest.mark.asyncio

_SWEEP = "app.workers.savings_research_task.savings_research_service.run_due_research"


async def test_a_tick_starts_a_sweep_and_never_doubles_one() -> None:
    gate = asyncio.Event()

    async def _slow() -> int:
        await gate.wait()
        return 1

    with patch(_SWEEP, side_effect=_slow) as sweep:
        first = savings_research_task.start_savings_research(None)
        again = savings_research_task.start_savings_research(first)
        assert again is first
        gate.set()
        await first
        replaced = savings_research_task.start_savings_research(first)
        assert replaced is not first
        await replaced
    assert sweep.await_count == 2


async def test_a_failing_sweep_is_logged_not_raised(caplog: pytest.LogCaptureFixture) -> None:
    with patch(_SWEEP, AsyncMock(side_effect=RuntimeError("db down"))):
        task = savings_research_task.start_savings_research(None)
        await task
    assert task.exception() is None
    assert "Savings research sweep failed" in caplog.text


async def test_shutdown_cancels_a_running_sweep() -> None:
    async def _forever() -> int:
        await asyncio.sleep(60)
        return 0

    with patch(_SWEEP, side_effect=_forever):
        task = savings_research_task.start_savings_research(None)
        await asyncio.sleep(0)
        await savings_research_task.stop_savings_research(task)
    assert task.cancelled()
    await savings_research_task.stop_savings_research(None)


async def test_the_scheduler_loop_starts_and_stops_it() -> None:
    stop = asyncio.Event()
    started: list[object] = []
    stopped: list[object] = []

    def _start(running: object) -> str:
        started.append(running)
        stop.set()
        return "task"

    async def _stop(running: object) -> None:
        stopped.append(running)

    with (
        patch.object(scheduler_worker, "start_savings_research", _start),
        patch.object(scheduler_worker, "stop_savings_research", _stop),
        patch.object(scheduler_worker, "start_gmail_sync", AsyncMock(return_value=(None, True))),
        patch.object(scheduler_worker, "run_tick", AsyncMock(return_value=False)),
        patch.object(scheduler_worker, "stop_gmail_sync", AsyncMock()),
    ):
        await scheduler_worker.tick_until_stopped(
            stop, full_interval_seconds=3600, tick_seconds=3600, gmail_sync_cap_seconds=7200,
        )
    assert started == [None]
    assert stopped == ["task"]
