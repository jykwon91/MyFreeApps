import uuid
from typing import Literal

from pydantic import BaseModel


class SkippedDocument(BaseModel):
    id: uuid.UUID
    reason: Literal["not_found", "being_read"]
