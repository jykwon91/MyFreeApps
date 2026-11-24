"""A Link token for the browser. Short-lived and single-use; not a credential
to anyone's bank data."""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel


class PlaidLinkTokenResponse(BaseModel):
    link_token: str
    expiration: _dt.datetime
