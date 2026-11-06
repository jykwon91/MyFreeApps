"""A submission linked to a story, as triage sees it on the story."""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.wow.feature_requests.feature_literals import Verdict


class TriageSubmissionNote(BaseModel):
    submission_id: uuid.UUID
    verdict: Verdict
    nuance_note: Optional[str] = None
    created_at: datetime
