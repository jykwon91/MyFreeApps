"""The body Plaid returns with every non-2xx response
(https://plaid.com/docs/errors/)."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class PlaidWireError(BaseModel):
    error_type: str = "UNKNOWN"
    error_code: str = "UNKNOWN"
    error_message: str = ""
    request_id: str | None = None

    model_config = ConfigDict(extra="ignore")
