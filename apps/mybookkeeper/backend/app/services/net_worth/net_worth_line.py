"""One thing on the net worth page: an account, a loan record or a property."""
from __future__ import annotations

import datetime as _dt
import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class NetWorthLine:
    source: str
    source_id: uuid.UUID
    name: str
    detail: str | None
    group: str
    classification: str
    currency: str
    # None when nobody has entered one yet: the page asks for it rather than
    # counting a guessed zero.
    amount_cents: int | None
    as_of: _dt.date | None
