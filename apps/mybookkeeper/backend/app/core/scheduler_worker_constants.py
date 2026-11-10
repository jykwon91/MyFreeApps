"""Liveness tunables for the scheduler worker (``app/workers/scheduler_worker.py``).

Imports no settings: ``app/workers/scheduler_healthcheck.py`` reads these and
must not be able to fail for reasons unrelated to the worker.
"""
import tempfile
from pathlib import Path
from typing import Final

# Ticks are up to an hour apart and a Gmail sync can run for minutes, so the
# heartbeat is not tied to ticks: a background task touches it this often
# for as long as the process and its event loop are alive. It reports
# liveness only — job failures go to the logs / Sentry.
HEARTBEAT_INTERVAL_SECONDS: Final = 30

# Stale after this long means the worker is dead or its event loop has been
# blocked for minutes — never that it is sleeping or mid-sync, and never that
# a job failed. Six missed
# beats, so a briefly blocking call cannot flap the healthcheck.
HEARTBEAT_MAX_AGE_SECONDS: Final = HEARTBEAT_INTERVAL_SECONDS * 6

HEARTBEAT_PATH: Final = Path(tempfile.gettempdir()) / "mbk-scheduler-heartbeat"
