from datetime import datetime
from typing import TypedDict


class SyncLogInfo(TypedDict):
    id: int
    status: str
    records_added: int
    error: str | None
    started_at: datetime
    completed_at: datetime | None
    cancelled_at: datetime | None
    total_items: int
    emails_total: int
    emails_done: int
    emails_fetched: int
    gmail_matches_total: int
