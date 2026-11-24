"""``/link/token/create``."""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel, ConfigDict


class PlaidWireLinkTokenResponse(BaseModel):
    link_token: str
    expiration: _dt.datetime

    model_config = ConfigDict(extra="ignore")
