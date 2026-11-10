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

from platform_shared.workers.heartbeat_healthcheck import check_heartbeat

from app.core.discovery_scheduler_constants import (
    HEARTBEAT_MAX_AGE_SECONDS,
    HEARTBEAT_PATH,
)


def main() -> int:
    return check_heartbeat(HEARTBEAT_PATH, HEARTBEAT_MAX_AGE_SECONDS)


if __name__ == "__main__":
    sys.exit(main())
