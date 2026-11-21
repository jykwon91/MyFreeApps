"""Fire-and-forget work that is held, awaited at shutdown and never lost silently."""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine

from platform_shared.core.tracked_task_constants import SHUTDOWN_DRAIN_TIMEOUT_SECONDS

logger = logging.getLogger(__name__)

# Strong references: the event loop holds tasks only weakly, so a task nobody
# awaits could otherwise be collected mid-run (same reason as run_to_completion).
_TRACKED: set[asyncio.Task[None]] = set()


def spawn_tracked(work: Coroutine[object, object, None], *, name: str) -> asyncio.Task[None]:
    """Run ``work`` in the background; log its failure at ERROR instead of losing it."""
    task = asyncio.create_task(work, name=name)
    _TRACKED.add(task)
    task.add_done_callback(_finish)
    return task


def _finish(task: asyncio.Task[None]) -> None:
    _TRACKED.discard(task)
    if task.cancelled():
        return
    error = task.exception()
    if error is not None:
        logger.error("Background task %s failed", task.get_name(), exc_info=error)


async def drain_tracked(timeout_seconds: float | None = None) -> None:
    """Wait for every tracked task to finish (shutdown, and tests that assert on the result).

    With ``timeout_seconds`` the wait is bounded: tasks still running afterwards
    are logged at ERROR (they are about to be lost) instead of blocking forever.
    """
    if timeout_seconds is None:
        while _TRACKED:
            await asyncio.gather(*list(_TRACKED), return_exceptions=True)
        return
    if not _TRACKED:
        return
    _, pending = await asyncio.wait(list(_TRACKED), timeout=timeout_seconds)
    for task in pending:
        logger.error(
            "Background task %s still pending after %.1fs at shutdown; it will be lost",
            task.get_name(),
            timeout_seconds,
        )


async def drain_tracked_at_shutdown() -> None:
    """Bounded drain used by the shared lifespan so a deploy does not drop in-flight work."""
    await drain_tracked(SHUTDOWN_DRAIN_TIMEOUT_SECONDS)


__all__ = ["drain_tracked", "drain_tracked_at_shutdown", "spawn_tracked"]
