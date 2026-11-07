"""Request body for POST /signed-leases/{lease_id}/generate."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.leases.client_local_date import ClientLocalDate


class SignedLeaseGenerateRequest(BaseModel):
    """The host's local date, for computed ``today`` placeholders."""

    today: ClientLocalDate

    model_config = ConfigDict(extra="forbid")
