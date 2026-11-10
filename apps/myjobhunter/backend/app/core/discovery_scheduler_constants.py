"""Tuning constants for the discovery scheduler process.

See ``app/workers/discovery_scheduler_worker.py`` for how they are used.
"""
from __future__ import annotations

from pathlib import Path

# APScheduler's SQLAlchemyJobStore table. Created by the
# ``apschedjobs261110`` migration — never auto-created at runtime.
JOBSTORE_TABLE_NAME = "apscheduler_jobs"

# How often the scheduler process re-reads ``discovery_sources`` and brings
# its jobstore in line with it. The API only writes the source row, and
# APScheduler's jobstore wakeup does not cross processes, so this bounds how
# long a created / re-intervalled / deactivated saved search waits before
# the schedule reflects it. The shortest allowed fetch interval is far
# longer than this, and the job itself re-checks ``is_active`` before
# fetching, so a minute of lag never causes a fetch the user turned off.
RECONCILE_INTERVAL_SECONDS = 60

# After this many reconciles fail in a row the worker exits non-zero, so
# ``restart: unless-stopped`` restarts it and boot re-runs its fail-loud
# checks (Docker never restarts a merely *unhealthy* container). A single
# blip recovers in place on the next interval.
MAX_CONSECUTIVE_RECONCILE_FAILURES = 3

# The worker touches this file after every successful reconcile; the
# container healthcheck reports unhealthy once it goes stale. Sized to the
# failure budget above: by the time the heartbeat is this old the worker
# has either recovered or exited.
HEARTBEAT_PATH = Path("/tmp/discovery-scheduler-heartbeat")
HEARTBEAT_MAX_AGE_SECONDS = RECONCILE_INTERVAL_SECONDS * MAX_CONSECUTIVE_RECONCILE_FAILURES
