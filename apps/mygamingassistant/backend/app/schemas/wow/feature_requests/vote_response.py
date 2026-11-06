"""Vote / un-vote result."""
import uuid

from pydantic import BaseModel


class VoteResponse(BaseModel):
    # Where the vote landed: differs from the path id for a merged story.
    story_id: uuid.UUID
    voted: bool
    vote_count: int
