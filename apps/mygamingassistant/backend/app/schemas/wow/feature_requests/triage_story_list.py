"""GET /wow/feature-requests/triage/stories."""
from pydantic import BaseModel

from app.schemas.wow.feature_requests.triage_story import TriageStory


class TriageStoryList(BaseModel):
    items: list[TriageStory]
