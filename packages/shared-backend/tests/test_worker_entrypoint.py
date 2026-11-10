"""platform_shared.workers.entrypoint — signal handling + process entry."""
from __future__ import annotations

import asyncio
import os
import signal

import pytest

from platform_shared.workers.entrypoint import run_until_signalled, run_worker


@pytest.mark.parametrize("sig", [signal.SIGTERM, signal.SIGINT])
async def test_a_stop_signal_sets_stop_and_the_handlers_are_removed(sig: signal.Signals) -> None:
    seen: list[bool] = []

    async def body(stop: asyncio.Event) -> None:
        os.kill(os.getpid(), sig)
        await asyncio.wait_for(stop.wait(), timeout=5)
        seen.append(stop.is_set())

    await run_until_signalled(body)
    assert seen == [True]
    assert asyncio.get_running_loop().remove_signal_handler(sig) is False


async def test_handlers_are_removed_when_the_body_raises() -> None:
    async def body(stop: asyncio.Event) -> None:
        raise RuntimeError("fatal")

    with pytest.raises(RuntimeError, match="fatal"):
        await run_until_signalled(body)
    assert asyncio.get_running_loop().remove_signal_handler(signal.SIGTERM) is False


def test_run_worker_runs_main_to_completion() -> None:
    ran: list[bool] = []

    async def main() -> None:
        ran.append(True)

    run_worker(main)
    assert ran == [True]


def test_run_worker_propagates_fatal_errors() -> None:
    async def main() -> None:
        raise RuntimeError("exit non-zero")

    with pytest.raises(RuntimeError, match="exit non-zero"):
        run_worker(main)
