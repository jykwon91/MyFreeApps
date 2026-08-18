"""Schema for the body of ``POST /mortgages/extract``."""
from __future__ import annotations

import uuid

from pydantic import BaseModel


class MortgageExtractRequest(BaseModel):
    document_id: uuid.UUID
