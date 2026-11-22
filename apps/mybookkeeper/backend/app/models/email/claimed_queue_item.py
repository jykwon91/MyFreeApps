import uuid
from dataclasses import dataclass
from datetime import date, datetime


@dataclass(frozen=True)
class ClaimedQueueItem:
    """The fields of a fetched email queue row, read once when it is claimed."""

    id: uuid.UUID
    message_id: str
    sync_log_id: int
    attachment_id: str
    attachment_filename: str | None
    attachment_content_type: str | None
    email_subject: str | None
    raw_content: bytes | None
    fetched_on: date
    attempts: int
    """Attempts so far, including this one."""
    claimed_at: datetime
    """This claim's stamp: the result is written only while the row still carries it."""
