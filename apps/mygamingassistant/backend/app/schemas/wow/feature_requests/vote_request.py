"""POST / DELETE /wow/feature-requests/{id}/vote body."""
import uuid

from pydantic import BaseModel, ConfigDict


class VoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: uuid.UUID
