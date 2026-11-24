"""A source's value on one day, as a snapshot recorded it."""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass

from app.services.net_worth.snapshot_source_key import SnapshotSourceKey


@dataclass(frozen=True)
class DatedValue:
    key: SnapshotSourceKey
    day: _dt.date
    cents: int
