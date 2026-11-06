"""POST /wow/feature-requests body.

A first submission sends ``text``. A follow-up to a ``needs_clarification``
verdict sends ``parent_submission_id`` + ``clarification_answer``; its ``text``
is optional and ignored (the server combines the parent's stored text with the
answer). An empty / whitespace / missing answer means the visitor chose
"Skip, submit as is": the parent's text is refined on its own, and Claude is
never allowed to ask again. The 10-1000 length check on ``text`` runs after control characters
are stripped, in ``feature_submission_service``.
"""
import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.wow_feature_request_limits import CLARIFICATION_ANSWER_MAX, RAW_TEXT_MAX
from app.schemas.wow.feature_requests.feature_context import FeatureRequestContext


class FeatureSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Outer bound only; the real check runs on the cleaned text.
    text: Optional[str] = Field(default=None, max_length=RAW_TEXT_MAX * 2)
    context: Optional[FeatureRequestContext] = None
    # The browser's localStorage UUID, only ever stored as an HMAC.
    client_id: uuid.UUID
    parent_submission_id: Optional[uuid.UUID] = None
    clarification_answer: Optional[str] = Field(default=None, max_length=CLARIFICATION_ANSWER_MAX)

    @model_validator(mode="after")
    def _first_or_follow_up(self) -> "FeatureSubmitRequest":
        if self.parent_submission_id is None:
            if self.clarification_answer is not None:
                raise ValueError("clarification_answer needs parent_submission_id")
            if not (self.text and self.text.strip()):
                raise ValueError("text is required")
        return self
