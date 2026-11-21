"""Shutdown timing for ``platform_shared.core.tracked_task`` and the api containers.

On a redeploy docker sends SIGTERM and SIGKILLs after ``stop_grace_period``
(compose default 10s). Within that window uvicorn first lets in-flight requests
finish (capped by ``--timeout-graceful-shutdown``), then runs the lifespan
shutdown, which drains tracked background tasks. The three numbers below must
add up, so the container grace period is derived from them rather than typed.
"""
from __future__ import annotations

from typing import Final

# uvicorn ``--timeout-graceful-shutdown``: longest in-flight requests may keep
# the server from reaching lifespan shutdown.
UVICORN_GRACEFUL_SHUTDOWN_SECONDS: Final = 15

# Longest the lifespan waits for tracked tasks (e.g. a password-reset email).
# Above one SMTP send (SMTP_TIMEOUT_SECONDS) so a send that has started can finish.
SHUTDOWN_DRAIN_TIMEOUT_SECONDS: Final = 25.0

# Slack for the DB pool teardown and process exit before SIGKILL.
SHUTDOWN_MARGIN_SECONDS: Final = 5

# api service ``stop_grace_period`` (seconds): request wait + drain + margin.
API_STOP_GRACE_PERIOD_SECONDS: Final = int(
    UVICORN_GRACEFUL_SHUTDOWN_SECONDS + SHUTDOWN_DRAIN_TIMEOUT_SECONDS + SHUTDOWN_MARGIN_SECONDS
)
