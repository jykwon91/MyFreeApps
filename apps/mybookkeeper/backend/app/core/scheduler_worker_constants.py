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

# A Gmail sync still running this many full intervals after it started is
# taken as hung: the scheduler cancels it (the sync hands its email back and
# closes its log) and starts a new one. Below that a full cycle that finds it
# running only logs an error. Two days at the default daily interval.
GMAIL_SYNC_HARD_CAP_FULL_INTERVALS: Final = 2

# How long the scheduler waits for a cancelled Gmail sync to unwind (its
# clean-up writes) before it starts the next one anyway.
GMAIL_SYNC_CANCEL_GRACE_SECONDS: Final = 30

# How long shutdown waits for a cancelled savings research sweep to unwind.
SAVINGS_RESEARCH_CANCEL_GRACE_SECONDS: Final = 10
