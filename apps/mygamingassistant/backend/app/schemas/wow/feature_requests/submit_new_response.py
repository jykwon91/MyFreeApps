"""Submit verdict ``new``: a story was created and awaits review."""
import uuid
from typing import Literal

from pydantic import BaseModel

from app.schemas.wow.feature_requests.submitted_story import SubmittedStory


class SubmitNewResponse(BaseModel):
    verdict: Literal["new"] = "new"
    submission_id: uuid.UUID
    story: SubmittedStory
