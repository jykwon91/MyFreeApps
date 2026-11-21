"""Non-Claude failures a background worker retries later.

Passed as ``extra_transient`` to ``platform_shared.extraction.is_transient_failure``:
the read timing out or a dropped socket clears on its own.
``asyncio.TimeoutError`` is ``TimeoutError`` on Python 3.11+.
"""
from __future__ import annotations

TRANSIENT_WORKER_ERRORS: tuple[type[BaseException], ...] = (TimeoutError, ConnectionError)
