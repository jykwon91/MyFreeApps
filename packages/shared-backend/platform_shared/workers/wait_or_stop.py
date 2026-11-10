"""Interruptible wait for long-running worker loops."""
from __future__ import annotations

import asyncio


async def wait_or_stop(stop: asyncio.Event, timeout: float) -> None:
    """Wait ``timeout`` seconds, returning early as soon as ``stop`` is set."""
    try:
        await asyncio.wait_for(stop.wait(), timeout=timeout)
    except TimeoutError:
        return
