"""``run_to_completion`` lets work finish before a cancellation goes through."""
from __future__ import annotations

import asyncio

import pytest

from platform_shared.core.run_to_completion import run_to_completion


async def test_returns_the_result() -> None:
    async def work() -> int:
        return 7

    assert await run_to_completion(work()) == 7


async def test_errors_propagate() -> None:
    async def work() -> None:
        raise ValueError("boom")

    with pytest.raises(ValueError, match="boom"):
        await run_to_completion(work())


async def test_every_cancel_waits_for_the_work_then_goes_through() -> None:
    gate = asyncio.Event()
    finished: list[bool] = []

    async def work() -> None:
        await gate.wait()
        finished.append(True)

    task = asyncio.create_task(run_to_completion(work()))
    await asyncio.sleep(0)
    for _ in range(3):
        task.cancel()
        await asyncio.sleep(0.01)
        assert not task.done()
    gate.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert finished == [True]

