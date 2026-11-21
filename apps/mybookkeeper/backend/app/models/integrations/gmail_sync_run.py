import asyncio
from dataclasses import dataclass


@dataclass(frozen=True)
class GmailSyncRun:
    """The scheduler's background Gmail sync and when it started (``time.monotonic()``).

    ``overrun_reported`` is set once the sync has been logged as having run
    past a whole full interval, so that error is logged once per run.
    """

    task: asyncio.Task[None]
    started_at: float
    overrun_reported: bool = False
