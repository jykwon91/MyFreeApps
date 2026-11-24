"""Container healthcheck for the ``resume-parser`` service.

Run with:
    python -m app.workers.resume_parser_healthcheck

Exits 0 while the resume worker's heartbeat is fresh, 1 otherwise (never
booted, crashed, or its event loop is wedged). Imports no settings or
database code, so the probe is cheap and cannot fail on misconfiguration.
"""
import sys

from platform_shared.workers.heartbeat_healthcheck import check_heartbeat

from app.core.resume_worker_constants import HEARTBEAT_MAX_AGE_SECONDS, HEARTBEAT_PATH


def main() -> int:
    return check_heartbeat(HEARTBEAT_PATH, HEARTBEAT_MAX_AGE_SECONDS)


if __name__ == "__main__":
    sys.exit(main())
