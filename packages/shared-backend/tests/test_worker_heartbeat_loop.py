"""platform_shared.workers.heartbeat_loop.run_heartbeat_loop."""
from __future__ import annotations

import asyncio
import os
from collections.abc import Awaitable, Callable
from pathlib import Path

import pytest

from platform_shared.workers.heartbeat_loop import run_heartbeat_loop
from platform_shared.workers.worker_tick_failing_error import WorkerTickFailingError


async def _run(
    stop: asyncio.Event, tick: Callable[[], Awaitable[None]], path: Path, *, max_failures: int = 3,
) -> None:
    await asyncio.wait_for(
        run_heartbeat_loop(
            stop, tick, interval_seconds=0.01, max_consecutive_failures=max_failures,
            heartbeat_path=path, label="test worker",
        ),
        timeout=5,
    )


async def test_ticks_and_heartbeats_until_stopped(tmp_path: Path) -> None:
    path = tmp_path / "hb"
    stop = asyncio.Event()
    calls: list[int] = []

    async def tick() -> None:
        calls.append(len(calls) + 1)
        if len(calls) == 3:
            stop.set()

    await _run(stop, tick, path)
    assert calls == [1, 2, 3]
    assert path.exists()


async def test_a_failing_first_tick_propagates_without_a_heartbeat(tmp_path: Path) -> None:
    path = tmp_path / "hb"

    async def tick() -> None:
        raise RuntimeError("boot failed")

    with pytest.raises(RuntimeError, match="boot failed"):
        await _run(asyncio.Event(), tick, path)
    assert not path.exists()


async def test_one_failure_recovers_and_resets_the_budget(tmp_path: Path) -> None:
    path = tmp_path / "hb"
    stop = asyncio.Event()
    mtimes: dict[int, float] = {}
    calls: list[int] = []

    async def tick() -> None:
        n = len(calls) + 1
        calls.append(n)
        if n == 1:
            return
        mtimes[n] = path.stat().st_mtime
        if n in (2, 4):  # never two in a row
            os.utime(path, (1.0, 1.0))
            raise RuntimeError("blip")
        if n == 5:
            stop.set()

    await _run(stop, tick, path, max_failures=2)
    assert calls == [1, 2, 3, 4, 5]
    assert mtimes[3] == 1.0, "a failed tick must not advance the heartbeat"
    assert path.stat().st_mtime > 1.0


async def test_consecutive_failures_raise(tmp_path: Path) -> None:
    path = tmp_path / "hb"
    calls: list[int] = []

    async def tick() -> None:
        calls.append(len(calls) + 1)
        if len(calls) > 1:
            raise RuntimeError("down")

    with pytest.raises(WorkerTickFailingError, match="test worker tick failed 3 times in a row") as info:
        await _run(asyncio.Event(), tick, path)
    assert isinstance(info.value.__cause__, RuntimeError)
    assert calls == [1, 2, 3, 4]


async def test_stop_during_the_wait_returns_without_another_tick(tmp_path: Path) -> None:
    path = tmp_path / "hb"
    stop = asyncio.Event()
    calls: list[int] = []

    async def tick() -> None:
        calls.append(1)

    task = asyncio.create_task(
        run_heartbeat_loop(
            stop, tick, interval_seconds=30, max_consecutive_failures=3, heartbeat_path=path, label="w",
        ),
    )
    while not path.exists():
        await asyncio.sleep(0.01)
    stop.set()
    await asyncio.wait_for(task, timeout=5)
    assert calls == [1]
