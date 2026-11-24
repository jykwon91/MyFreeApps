"""The fields of a Plaid webhook body the app reads.

``error`` is present on ``ITEM`` / ``ERROR`` webhooks.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.plaid.wire.plaid_wire_error import PlaidWireError


class PlaidWireWebhook(BaseModel):
    webhook_type: str
    webhook_code: str
    item_id: str | None = None
    error: PlaidWireError | None = None

    model_config = ConfigDict(extra="ignore")
