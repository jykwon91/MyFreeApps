"""A story with every field, private ones included (triage API only).

``updated_at`` is the optimistic-concurrency version: send it back as
``If-Match`` on PATCH / merge.
"""
import uuid
from datetime import datetime
from typing import Optional

from app.schemas.wow.feature_requests.feature_literals import StoryStatus
from app.schemas.wow.feature_requests.refined_story import RefinedStory
from app.schemas.wow.feature_requests.triage_submission_note import TriageSubmissionNote


class TriageStory(RefinedStory):
    id: uuid.UUID
    status: StoryStatus
    priority: Optional[int] = None
    operator_note: Optional[str] = None
    shipped_path: Optional[str] = None
    shipped_at: Optional[datetime] = None
    merged_into_id: Optional[uuid.UUID] = None
    vote_count: int
    hidden: bool
    created_at: datetime
    updated_at: datetime
    submissions: list[TriageSubmissionNote]
