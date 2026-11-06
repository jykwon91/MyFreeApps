"""A story on the public board.

An allowlist of fields: never priority, raw submission text, hashes or
submissions (``tests/test_wow_feature_requests_api.py`` pins the key set).
"""
import uuid
from datetime import datetime
from typing import Optional

from app.schemas.wow.feature_requests.feature_literals import PublicStoryStatus
from app.schemas.wow.feature_requests.refined_story import RefinedStory


class PublicStory(RefinedStory):
    id: uuid.UUID
    status: PublicStoryStatus
    operator_note: Optional[str] = None
    shipped_path: Optional[str] = None
    vote_count: int
    created_at: datetime
