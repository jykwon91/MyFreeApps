"""Submit verdict ``duplicate``: linked to a public story; the "me too" vote
went through the normal vote path (``voted`` says whether it counted)."""
from typing import Literal, Optional

from pydantic import BaseModel

from app.schemas.wow.feature_requests.public_story import PublicStory


class SubmitDuplicateResponse(BaseModel):
    verdict: Literal["duplicate"] = "duplicate"
    story: PublicStory
    nuance_note: Optional[str] = None
    voted: bool
