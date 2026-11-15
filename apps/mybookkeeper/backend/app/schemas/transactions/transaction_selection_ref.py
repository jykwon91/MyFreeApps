import uuid

from pydantic import BaseModel, ConfigDict


class TransactionSelectionRef(BaseModel):
    """What the web table needs to tick a row it hasn't loaded: its id, and whether bulk Approve applies to it."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    property_id: uuid.UUID | None
    status: str
