"""Container healthcheck for the discovery scheduler process.

Run with:
    python -m app.workers.discovery_scheduler_healthcheck

Exits 0 when the worker's reconcile loop has written its heartbeat within
``HEARTBEAT_MAX_AGE_SECONDS``, 1 otherwise (never started, crashed, hung, or
failing every reconcile). Deliberately imports no settings / DB code so the
probe is cheap and cannot fail for reasons unrelated to the worker.
"""
from __future__ import annotations

import sys

from app.core.discovery_scheduler_constants import (
    HEARTBEAT_MAX_AGE_SECONDS,
    HEARTBEAT_PATH,
)
from app.core.heartbeat import heartbeat_age_seconds


def main() -> int:
    age = heartbeat_age_seconds(HEARTBEAT_PATH)
    if age is None:
        print(f"unhealthy: no heartbeat at {HEARTBEAT_PATH}")
        return 1
    if age > HEARTBEAT_MAX_AGE_SECONDS:
        print(f"unhealthy: heartbeat is {age:.0f}s old (max {HEARTBEAT_MAX_AGE_SECONDS}s)")
        return 1
    print(f"healthy: heartbeat {age:.0f}s old")
    return 0


if __name__ == "__main__":
    sys.exit(main())
