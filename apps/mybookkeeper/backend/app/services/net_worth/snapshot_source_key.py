"""Which account, loan record or property a snapshot or a line is about."""
from __future__ import annotations

import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class SnapshotSourceKey:
    source: str
    source_id: uuid.UUID
