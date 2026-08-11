"""Schema for ``POST /utility-plans/extract``."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict


class UtilityPlanExtractRequest(BaseModel):
    """Names an already-uploaded document to read plan terms out of.

    The document is uploaded through ``POST /documents/upload`` first rather
    than posted here, so there is exactly one path that enforces the size cap,
    the daily rate limit, and the content sniff — and so the resulting draft can
    cite a document that actually exists.
    """

    document_id: uuid.UUID

    model_config = ConfigDict(extra="forbid")
