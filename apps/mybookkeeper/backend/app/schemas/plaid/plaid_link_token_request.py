"""Ask for a Link token. With ``item_id`` Link opens in update mode to
reconnect that connection; without, it connects a new bank. ``add_investments``
(with ``item_id``) opens update mode to allow investment holdings on it."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, model_validator


class PlaidLinkTokenRequest(BaseModel):
    item_id: uuid.UUID | None = None
    add_investments: bool = False

    @model_validator(mode="after")
    def _investments_need_an_item(self) -> PlaidLinkTokenRequest:
        if self.add_investments and self.item_id is None:
            raise ValueError("add_investments needs the item_id of the connection to add them to")
        return self
