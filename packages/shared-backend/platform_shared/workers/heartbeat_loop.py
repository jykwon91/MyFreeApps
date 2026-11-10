"""The tick loop of a long-running worker, with a heartbeat and a failure budget.

The first tick is part of boot: if it raises, the error propagates and the
process exits non-zero (fail loud — the deploy's healthcheck gate fails).
After that, each tick runs every ``interval_seconds``:

* a tick that succeeds touches the heartbeat file the container healthcheck
  reads;
* a tick that raises is logged and retried next interval without advancing
  the heartbeat (a DB blip recovers in place);
* ``max_consecutive_failures`` failures in a row raise
  :class:`WorkerTickFailingError`, so the process exits and
  ``restart: unless-stopped`` restarts it.

Returns when ``stop`` is set (SIGTERM / SIGINT — see
:func:`platform_shared.workers.entrypoint.run_until_signalled`).
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path

from platform_shared.workers.heartbeat import touch_heartbeat
from platform_shared.workers.worker_tick_failing_error import WorkerTickFailingError

logger = logging.getLogger(__name__)


async def _wait_or_stop(stop: asyncio.Event, timeout: float) -> None:
    try:
        await asyncio.wait_for(stop.wait(), timeout=timeout)
    except TimeoutError:
        pass


async def run_heartbeat_loop(
    stop: asyncio.Event,
    tick: Callable[[], Awaitable[None]],
    *,
    interval_seconds: float,
    max_consecutive_failures: int,
    heartbeat_path: Path,
    label: str,
) -> None:
    """Run ``tick`` now and then every ``interval_seconds`` until ``stop`` is set."""
    await tick()
    touch_heartbeat(heartbeat_path)
    logger.info("%s running — ticking every %ss", label, interval_seconds)
    failures = 0
    while not stop.is_set():
        await _wait_or_stop(stop, interval_seconds)
        if stop.is_set():
            break
        try:
            await tick()
        except Exception as exc:  # noqa: BLE001 — bounded retry, then exit
            failures += 1
            logger.exception(
                "%s tick failed (%d/%d in a row)", label, failures, max_consecutive_failures,
            )
            if failures >= max_consecutive_failures:
                raise WorkerTickFailingError(
                    f"{label} tick failed {failures} times in a row",
                ) from exc
        else:
            failures = 0
            touch_heartbeat(heartbeat_path)
