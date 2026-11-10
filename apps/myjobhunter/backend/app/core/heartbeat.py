"""Liveness heartbeat file for long-running worker processes."""
from __future__ import annotations

import time
from pathlib import Path


def touch_heartbeat(path: Path) -> None:
    """Record that the worker loop completed a healthy iteration just now."""
    path.touch()


def clear_heartbeat(path: Path) -> None:
    """Forget any heartbeat from a previous run of the same container."""
    path.unlink(missing_ok=True)


def heartbeat_age_seconds(path: Path) -> float | None:
    """Seconds since the last heartbeat, or None if none was ever written."""
    try:
        return time.time() - path.stat().st_mtime
    except FileNotFoundError:
        return None
