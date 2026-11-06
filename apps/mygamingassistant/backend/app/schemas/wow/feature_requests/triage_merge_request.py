"""POST /wow/feature-requests/triage/stories/{id}/merge body."""
import uuid

from pydantic import BaseModel, ConfigDict


class TriageMergeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    into_story_id: uuid.UUID
