from dataclasses import dataclass

from app.models.inquiries.inquiry_reply_send import InquiryReplySend
from app.models.integrations.integration import Integration


@dataclass(frozen=True)
class ReplySendContext:
    """Everything a reply send needs, loaded and checked before anything is written."""

    integration: Integration
    to_address: str
    # What is emailed: the submitted body, with the pet disclosure in front when owed.
    body: str
    original_email_message_id: str | None
    # A ``sending`` claim an earlier attempt left past the stale window, to settle first.
    stale_claim: InquiryReplySend | None
