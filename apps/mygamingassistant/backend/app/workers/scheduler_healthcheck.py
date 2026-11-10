"""Container healthcheck for the ``scheduler`` service.

Healthy while the worker's heartbeat file is fresh. Imports no settings or
database code, so it is cheap and cannot itself fail on misconfiguration.
"""
from __future__ import annotations

import sys

from platform_shared.workers.heartbeat_healthcheck import check_heartbeat

from app.core.scheduler_constants import HEARTBEAT_MAX_AGE_SECONDS, HEARTBEAT_PATH


def main() -> int:
    return check_heartbeat(HEARTBEAT_PATH, HEARTBEAT_MAX_AGE_SECONDS)


if __name__ == "__main__":
    sys.exit(main())
