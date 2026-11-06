"""GET /wow/feature-requests/{id} for a story merged into another."""
import uuid

from pydantic import BaseModel


class MergedStoryPointer(BaseModel):
    merged_into_id: uuid.UUID
