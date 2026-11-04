"""How to reach a reference. Only returned by the audited reveal."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict


class ReferenceContactResponse(BaseModel):
    id: uuid.UUID
    reference_contact: str

    model_config = ConfigDict(from_attributes=True)
