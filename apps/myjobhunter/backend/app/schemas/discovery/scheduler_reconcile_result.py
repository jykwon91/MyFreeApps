"""Outcome of one scheduler reconcile pass."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SchedulerReconcileResult:
    """How many jobs one reconcile pass added, rescheduled and removed."""

    added: int
    rescheduled: int
    removed: int
    active_sources: int

    @property
    def changed(self) -> bool:
        return bool(self.added or self.rescheduled or self.removed)
