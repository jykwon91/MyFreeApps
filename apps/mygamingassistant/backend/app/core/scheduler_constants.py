"""Job ids and tuning constants for the scheduler process.

See ``app/workers/scheduler_worker.py`` for how the process uses them.
"""
from __future__ import annotations

from pathlib import Path
from typing import Final

# Job ids — the APScheduler job ids, the ``scheduler_job`` rows and the
# ``/api/scheduler/trigger/{job_id}`` path segment.
JOB_SYNC_ALL_SOURCES: Final = "sync_all_sources"
JOB_CLEANUP_DOWNLOADS: Final = "cleanup_ingestion_downloads"
JOB_RAID_NOTIFICATIONS: Final = "raid_notifications"
JOB_REFRESH_WOW_PRICES: Final = "refresh_wow_prices"
JOB_PURGE_FEATURE_SUBMISSIONS: Final = "purge_wow_feature_submissions"
JOB_RECORD_SERVER_STATUS: Final = "record_wow_server_status"
JOB_PURGE_SERVER_STATUS: Final = "purge_wow_server_status_history"
JOB_PURGE_CHARACTER_METRICS: Final = "purge_wow_character_metrics"

# The jobs an operator may run on demand (POST /api/scheduler/trigger/{job_id}).
TRIGGERABLE_JOB_IDS: Final = frozenset({JOB_SYNC_ALL_SOURCES, JOB_CLEANUP_DOWNLOADS, JOB_REFRESH_WOW_PRICES})

RAID_NOTIFICATIONS_INTERVAL_SECONDS: Final = 60
CLEANUP_DOWNLOADS_INTERVAL_HOURS: Final = 1

# How often the scheduler process syncs with the ``scheduler_job`` table:
# it starts the runs the API requested, then records every job's next run
# (the API's status view, and where a restart resumes each job's cadence).
# Bounds how long a manual trigger waits to start.
TICK_INTERVAL_SECONDS: Final = 15

# After this many ticks fail in a row the worker exits non-zero, so
# ``restart: unless-stopped`` restarts it and boot re-runs its fail-loud
# checks (Docker never restarts a merely *unhealthy* container). A single
# blip recovers in place on the next tick.
MAX_CONSECUTIVE_TICK_FAILURES: Final = 3

# The worker touches this file after every successful tick; the container
# healthcheck reports unhealthy once it goes stale. The API treats the
# scheduler as not running once its last ``scheduler_job`` report is older
# than the same age. Sized to the failure budget above: by then the worker
# has either recovered or exited.
HEARTBEAT_PATH: Final = Path("/tmp/mga-scheduler-heartbeat")
HEARTBEAT_MAX_AGE_SECONDS: Final = TICK_INTERVAL_SECONDS * MAX_CONSECUTIVE_TICK_FAILURES
