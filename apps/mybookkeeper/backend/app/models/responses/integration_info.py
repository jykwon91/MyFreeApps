from datetime import datetime
from typing import TypedDict


class IntegrationInfo(TypedDict):
    provider: str
    last_synced_at: datetime | None
    connected: bool
