"""A validated, cleaned submission, ready for refinement."""
import uuid
from dataclasses import dataclass

from app.schemas.wow.feature_requests.feature_context import FeatureRequestContext
from app.services.wow.feature_requests.feature_text import text_fingerprint


@dataclass(frozen=True)
class PreparedSubmission:
    raw_text: str
    # A follow-up's answer; None for a first submission or a skipped question.
    clarification_answer: str | None
    parent_id: uuid.UUID | None
    context: FeatureRequestContext | None
    client_id: uuid.UUID

    @property
    def is_follow_up(self) -> bool:
        return self.parent_id is not None

    @property
    def fingerprint(self) -> str:
        if self.clarification_answer is None:
            return text_fingerprint(self.raw_text)
        return text_fingerprint(f"{self.raw_text}\n{self.clarification_answer}")
