"""``/item/public_token/exchange``. ``access_token`` is a credential: never log it."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, SecretStr


class PlaidWireExchangeResponse(BaseModel):
    access_token: SecretStr
    item_id: str

    model_config = ConfigDict(extra="ignore")
