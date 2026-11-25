import uuid

from pydantic import BaseModel, ConfigDict


class PersonalTransferSenderRead(BaseModel):
    """A sender whose payments are always marked personal transfers."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str
    # The empty string when the payment that taught the rule showed no handle.
    payer_handle: str
