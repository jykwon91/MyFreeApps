"""A freshly refined story as its submitter sees it (status ``submitted``)."""
import uuid
from typing import Literal

from app.schemas.wow.feature_requests.refined_story import RefinedStory


class SubmittedStory(RefinedStory):
    id: uuid.UUID
    status: Literal["submitted"] = "submitted"
