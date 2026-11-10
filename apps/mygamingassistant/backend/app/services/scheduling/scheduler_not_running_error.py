"""Raised when the scheduler process has not reported in recently."""
from __future__ import annotations


class SchedulerNotRunningError(RuntimeError):
    """The scheduler service is down (or was never started)."""
