"""The user-story fields Claude writes and triage edits.

Shared by the submit response ("Here is how I understood it"), the public
story and the triage story. Never carries priority, raw text or any hash.
"""
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.wow.feature_requests.feature_literals import Feasibility, StoryArea


class RefinedStory(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str
    persona: str
    i_want: str
    so_that: str
    acceptance_criteria: list[str]
    follow_ups: list[str]
    area: StoryArea
    topic: Optional[str] = None
    feasibility: Feasibility
    feasibility_note: Optional[str] = None
