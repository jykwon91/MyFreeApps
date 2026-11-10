"""Process entrypoint helpers for long-running worker processes."""
from __future__ import annotations

import asyncio
import logging
import signal
from collections.abc import Awaitable, Callable, Coroutine

from platform_shared.core.logging_safety import install_crlf_safe_logging

_STOP_SIGNALS = (signal.SIGTERM, signal.SIGINT)


async def run_until_signalled(body: Callable[[asyncio.Event], Awaitable[None]]) -> None:
    """Run ``body(stop)``; SIGTERM / SIGINT set ``stop`` so it can shut down cleanly."""
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in _STOP_SIGNALS:
        loop.add_signal_handler(sig, stop.set)
    try:
        await body(stop)
    finally:
        for sig in _STOP_SIGNALS:
            loop.remove_signal_handler(sig)


def run_worker(main: Callable[[], Coroutine[None, None, None]]) -> None:
    """Configure logging like the API, then run ``main`` to completion.

    Exceptions propagate, so a fatal error exits the process non-zero.
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    install_crlf_safe_logging()
    asyncio.run(main())
