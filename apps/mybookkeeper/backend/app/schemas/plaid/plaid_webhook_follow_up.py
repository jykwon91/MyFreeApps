"""What a Plaid webhook asks to run after the 200 goes back: a full sync of
one connection, or (``holdings_only``) just its investment holdings."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict


class PlaidWebhookFollowUp(BaseModel):
    item_id: uuid.UUID
    holdings_only: bool = False

    model_config = ConfigDict(frozen=True)
