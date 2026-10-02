"""What became of a claimed notification — the raid notification worker's outcomes.

``raid_notification_worker`` turns each claimed row into one of these and
records it on the row (sent, skipped, retried with backoff, given up, or
re-checked later); ``RunStats`` tallies a run for its log line.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Sent:
    detail: str = ""


@dataclass(frozen=True)
class Skipped:
    reason: str


@dataclass(frozen=True)
class Failed:
    error: str


@dataclass(frozen=True)
class Undeliverable:
    error: str


@dataclass(frozen=True)
class Deferred:
    until: datetime


Outcome = Sent | Skipped | Failed | Undeliverable | Deferred


@dataclass
class RunStats:
    completed_events: int = 0
    late_dms: int = 0
    claimed: int = 0
    sent: int = 0
    skipped: int = 0
    failed: int = 0
    undeliverable: int = 0
    deferred: int = 0

    def count(self, outcome: Outcome) -> None:
        if isinstance(outcome, Sent):
            self.sent += 1
        elif isinstance(outcome, Skipped):
            self.skipped += 1
        elif isinstance(outcome, Failed):
            self.failed += 1
        elif isinstance(outcome, Undeliverable):
            self.undeliverable += 1
        else:
            self.deferred += 1
