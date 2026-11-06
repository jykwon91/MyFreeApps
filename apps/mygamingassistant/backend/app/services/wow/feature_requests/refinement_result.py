"""What Claude decided about one submission, after ``feature_response_mapper``."""
import uuid
from dataclasses import dataclass
from typing import Optional

from app.schemas.wow.feature_requests.refined_story import RefinedStory


@dataclass(frozen=True)
class RefinementResult:
    verdict: str
    # Set for ``new`` / ``duplicate`` (a duplicate still carries a story, used
    # if the target story disappears before the write).
    story: Optional[RefinedStory]
    # A candidate story id that was actually in this prompt.
    duplicate_of: Optional[uuid.UUID]
    nuance_note: Optional[str]
    # The clarifying question (needs_clarification) or reject reason.
    reason: Optional[str]
    model_id: str
