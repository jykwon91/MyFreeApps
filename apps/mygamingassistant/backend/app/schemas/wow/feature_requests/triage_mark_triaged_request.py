"""POST /wow/feature-requests/triage/submissions/mark-triaged body."""
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.core.wow_feature_request_limits import TRIAGE_MARK_MAX_IDS


class TriageMarkTriagedRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    submission_ids: list[uuid.UUID] = Field(min_length=1, max_length=TRIAGE_MARK_MAX_IDS)
