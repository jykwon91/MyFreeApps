"""GET /wow/feature-requests/triage/inbox: every untriaged submission
(oldest first, rejected / needs_clarification included) and the total count."""
from pydantic import BaseModel

from app.schemas.wow.feature_requests.triage_inbox_item import TriageInboxItem


class TriageInbox(BaseModel):
    items: list[TriageInboxItem]
    # All untriaged submissions; ``items`` may be capped below this.
    total_untriaged: int
