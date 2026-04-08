from typing import TypedDict


class QueueItemResponse(TypedDict):
    id: str
    sync_log_id: int
    attachment_filename: str | None
    email_subject: str | None
    status: str
    error: str | None
    created_at: str | None
