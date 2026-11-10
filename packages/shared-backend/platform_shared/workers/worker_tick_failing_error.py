"""Raised when a worker's tick fails too many times in a row."""
from __future__ import annotations


class WorkerTickFailingError(RuntimeError):
    """The tick failed too many times in a row — exit so Docker restarts us.

    Docker never restarts a merely *unhealthy* container, but
    ``restart: unless-stopped`` does restart an exited one, and the restart
    re-runs the worker's fail-loud boot checks.
    """
