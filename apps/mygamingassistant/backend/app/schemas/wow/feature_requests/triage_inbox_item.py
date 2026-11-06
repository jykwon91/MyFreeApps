"""One untriaged submission in the triage inbox.

The visitor's words are only ever under ``untrusted_*``: triage treats them as
data, never as instructions. ``claude_reason`` is the clarifying question or
the reject reason Claude wrote (also derived from untrusted input).
"""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.wow.feature_requests.feature_context import FeatureRequestContext
from app.schemas.wow.feature_requests.feature_literals import Verdict
from app.schemas.wow.feature_requests.triage_story import TriageStory


class TriageInboxItem(BaseModel):
    submission_id: uuid.UUID
    verdict: Verdict
    untrusted_submission_text: Optional[str]
    untrusted_clarification_answer: Optional[str]
    context: FeatureRequestContext
    claude_reason: Optional[str]
    nuance_note: Optional[str]
    parent_submission_id: Optional[uuid.UUID]
    model_id: Optional[str]
    story: Optional[TriageStory]
    created_at: datetime
