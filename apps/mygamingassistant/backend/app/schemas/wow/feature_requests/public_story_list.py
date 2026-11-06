"""GET /wow/feature-requests: one page of the public board."""
import uuid
from typing import Optional

from pydantic import BaseModel

from app.schemas.wow.feature_requests.public_story import PublicStory


class PublicStoryList(BaseModel):
    items: list[PublicStory]
    next_offset: Optional[int]
    total: int
    # Stories on this page the given client_id has voted for.
    voted_story_ids: list[uuid.UUID]
