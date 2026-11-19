import uuid

from pydantic import BaseModel, ConfigDict


class DocumentSelectionRef(BaseModel):
    """What a list needs to tick a document it hasn't loaded: its id, and whether it is still being read."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
