"""Merge result: the merged-away story and the story it now points at."""
from pydantic import BaseModel

from app.schemas.wow.feature_requests.triage_story import TriageStory


class TriageMergeResult(BaseModel):
    source: TriageStory
    target: TriageStory
