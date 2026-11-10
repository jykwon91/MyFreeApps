"""Container healthcheck verdict for a worker that writes a heartbeat file.

Each app keeps a tiny ``python -m app.workers.<x>_healthcheck`` module that
passes its own path + max age here. That module must import no settings or DB
code, so the probe is cheap and cannot fail for reasons unrelated to the
worker; this module imports nothing app-specific either.
"""
from __future__ import annotations

from pathlib import Path

from platform_shared.workers.heartbeat import heartbeat_age_seconds


def check_heartbeat(path: Path, max_age_seconds: float) -> int:
    """Exit code for the healthcheck: 0 when the heartbeat is fresh, else 1.

    Unhealthy when the worker never started, crashed, hung, or is failing
    every tick (a failed tick never advances the heartbeat).
    """
    age = heartbeat_age_seconds(path)
    if age is None:
        print(f"unhealthy: no heartbeat at {path}")
        return 1
    if age > max_age_seconds:
        print(f"unhealthy: heartbeat is {age:.0f}s old (max {max_age_seconds:.0f}s)")
        return 1
    print(f"healthy: heartbeat {age:.0f}s old")
    return 0
