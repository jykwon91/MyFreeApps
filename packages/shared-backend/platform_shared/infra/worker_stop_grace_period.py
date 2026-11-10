"""Validate an app.yaml worker ``stop_grace_period`` at render time.

How long ``docker compose`` waits after SIGTERM before SIGKILL (compose's
default is 10s). A worker that finishes its current unit of work on SIGTERM
sets it so a redeploy doesn't kill that work mid-write. A malformed value
would otherwise only fail on the VPS when compose parses the file.
"""
from __future__ import annotations

from platform_shared.infra.compose_duration import is_compose_duration


def validate_worker_stop_grace_period(worker_name: str, raw: object) -> str:
    """Return the duration string, or raise ValueError."""
    if not isinstance(raw, str) or not is_compose_duration(raw):
        raise ValueError(
            f"worker {worker_name!r} stop_grace_period must be a duration like '60s', got {raw!r}",
        )
    return raw
