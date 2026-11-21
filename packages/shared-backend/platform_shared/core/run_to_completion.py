"""Await work that must finish even if the caller is cancelled."""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable
from typing import TypeVar

_R = TypeVar("_R")

# Strong references: the event loop holds tasks only weakly, so a task whose
# caller was cancelled and stopped waiting could otherwise be collected mid-run.
_RUNNING: set[asyncio.Future[object]] = set()


async def run_to_completion(work: Awaitable[_R]) -> _R:
    """Return ``work``'s result once it is over, however often the caller is cancelled.

    A blocking call running in a thread can't be stopped, and cleanup that is
    cut short leaves storage and the database out of step. Every cancellation
    that arrives meanwhile is held back until ``work`` has finished, then the
    last one is raised (and ``work``'s own error is dropped in favour of it).
    """
    future = asyncio.ensure_future(work)
    _RUNNING.add(future)
    future.add_done_callback(_RUNNING.discard)
    cancelled: asyncio.CancelledError | None = None
    while not future.done():
        try:
            await asyncio.wait([future])
        except asyncio.CancelledError as exc:
            cancelled = exc
    if cancelled is not None:
        if not future.cancelled():
            future.exception()  # mark retrieved; the cancellation takes precedence
        raise cancelled
    return future.result()


__all__ = ["run_to_completion"]
