"""Keep a worker's heartbeat fresh independently of how long its work takes.

For a worker whose ticks are far apart (an hourly scheduler) or can run for
minutes (a Gmail sync), "touch after each tick" would make a sleeping or busy
worker look dead. Inside :func:`keep_heartbeat_fresh` a background task
touches the heartbeat every ``interval_seconds`` instead, so the heartbeat
goes stale only when the process is dead or its event loop is blocked. Bound
each piece of work with its own timeouts so an await cannot hang forever.

Use :func:`platform_shared.workers.heartbeat_loop.run_heartbeat_loop` instead
when ticks are short and frequent — there the heartbeat also proves each tick
succeeded.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from platform_shared.workers.heartbeat import touch_heartbeat

logger = logging.getLogger(__name__)


async def _beat_forever(path: Path, interval_seconds: float) -> None:
    while True:
        await asyncio.sleep(interval_seconds)
        touch_heartbeat(path)


def _log_if_beater_died(task: asyncio.Task[None]) -> None:
    """Make a dead heartbeat writer loud: the healthcheck alone would only
    report a stale heartbeat, not why it stopped."""
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error(
            "heartbeat writer stopped — the worker will report unhealthy",
            exc_info=(type(exc), exc, exc.__traceback__),
        )


@asynccontextmanager
async def keep_heartbeat_fresh(path: Path, *, interval_seconds: float) -> AsyncIterator[None]:
    """Touch ``path`` now and then every ``interval_seconds`` until the block exits.

    The first touch is synchronous, so an unwritable heartbeat path fails the
    worker at boot instead of leaving it silently unhealthy. If a later touch
    raises, the writer stops (the worker then reports unhealthy) and the
    error is logged at ERROR.
    """
    touch_heartbeat(path)
    beater = asyncio.create_task(_beat_forever(path, interval_seconds))
    beater.add_done_callback(_log_if_beater_died)
    try:
        yield
    finally:
        beater.cancel()
        await asyncio.wait([beater])
