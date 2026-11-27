"""The scheduler's background savings research task.

Research calls take minutes each, so like the Gmail sync they run beside the
ticks rather than inside one: a slow research run never delays a rent
reminder. Each tick starts a sweep (``run_due_research``) unless the last one
is still going; the sweep itself only researches for people who are due, so
an hourly start costs one query when nobody is. A sweep still running at
shutdown is cancelled; the run it was in stays ``running`` until the next
sweep closes it as interrupted (``STALE_RUN_MINUTES``).
"""
from __future__ import annotations

import asyncio
import logging

from app.core.scheduler_worker_constants import SAVINGS_RESEARCH_CANCEL_GRACE_SECONDS
from app.services.savings import savings_research_service

logger = logging.getLogger(__name__)

_TASK_NAME = "savings-research"


async def _sweep() -> None:
    try:
        started = await savings_research_service.run_due_research()
    except Exception:  # noqa: BLE001 — a failed sweep is retried next tick
        logger.exception("Savings research sweep failed")
        return
    if started:
        logger.info("Savings research sweep ran %d research runs", started)


def start_savings_research(running: asyncio.Task[None] | None) -> asyncio.Task[None]:
    """Start a sweep unless the previous one is still running; return the live task."""
    if running is not None and not running.done():
        return running
    return asyncio.create_task(_sweep(), name=_TASK_NAME)


async def stop_savings_research(running: asyncio.Task[None] | None) -> None:
    """Cancel a sweep still running at shutdown and give it a moment to unwind."""
    if running is None or running.done():
        return
    running.cancel()
    done, _ = await asyncio.wait({running}, timeout=SAVINGS_RESEARCH_CANCEL_GRACE_SECONDS)
    if not done:
        logger.error("The cancelled savings research didn't stop within %ds", SAVINGS_RESEARCH_CANCEL_GRACE_SECONDS)
