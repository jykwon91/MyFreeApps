"""One account, loan record or property on the net worth page."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel


class NetWorthLineResponse(BaseModel):
    # "account", "mortgage" or "property": which page edits it.
    source: str
    id: uuid.UUID
    name: str
    # The bank, the home a loan is on, or a property's address.
    detail: str | None = None
    # None until someone enters one; such a line is listed, not counted.
    amount_cents: int | None = None
    currency: str
    as_of: _dt.date | None = None
    # The value is older than ``STALE_AFTER_DAYS``.
    is_stale: bool
    # False when it has no value or is in another currency than the total.
    in_total: bool
