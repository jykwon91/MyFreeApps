"""Ask for a Link token. With ``item_id`` Link opens in update mode to
reconnect that connection; without, it connects a new bank."""
from __future__ import annotations

import uuid

from pydantic import BaseModel


class PlaidLinkTokenRequest(BaseModel):
    item_id: uuid.UUID | None = None
