"""One bank connection as the Accounts page shows it. The access token and
the sync cursor never leave the server."""
from __future__ import annotations

import datetime as _dt
import uuid

from pydantic import BaseModel


class PlaidItemResponse(BaseModel):
    id: uuid.UUID
    institution_name: str | None = None
    status: str
    # Plaid's code for the last failure, for support; the page words the
    # status itself.
    error_code: str | None = None
    last_synced_at: _dt.datetime | None = None
    # Where the connection stands on investment holdings; None until the sync
    # first asks. ``consent_required`` is what the "Add investments" button
    # answers.
    investments_status: str | None = None
    holdings_synced_at: _dt.datetime | None = None
    account_count: int
    created_at: _dt.datetime
