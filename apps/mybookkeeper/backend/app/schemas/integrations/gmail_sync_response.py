from pydantic import BaseModel


class GmailSyncResponse(BaseModel):
    status: str
    reason: str | None = None
    count: int | None = None
    sync_log_id: int | None = None
