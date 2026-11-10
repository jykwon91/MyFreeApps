"""Raised when a run is requested for a job the scheduler does not register."""
from __future__ import annotations


class JobNotScheduledError(LookupError):
    """The scheduler is running but has no such job (e.g. its switch is off)."""
