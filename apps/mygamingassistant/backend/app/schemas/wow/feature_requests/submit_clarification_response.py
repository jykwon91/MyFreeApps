"""Submit verdict ``needs_clarification``: answer ``question`` with a follow-up
POST carrying ``parent_submission_id`` = ``submission_id``."""
import uuid
from typing import Literal

from pydantic import BaseModel


class SubmitClarificationResponse(BaseModel):
    verdict: Literal["needs_clarification"] = "needs_clarification"
    submission_id: uuid.UUID
    question: str
