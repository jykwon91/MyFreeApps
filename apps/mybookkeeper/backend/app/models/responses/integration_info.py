from datetime import datetime
from typing import NotRequired, TypedDict


class IntegrationInfo(TypedDict):
    provider: str
    last_synced_at: datetime | None
    connected: bool
    # Gmail-specific. Present when ``provider == 'gmail'``; absent for others.
    # Frontend uses this to surface the reconnect banner when the host wants
    # to reply to inquiries but the stored OAuth tokens were minted before
    # PR 2.3 (and therefore lack the gmail.send scope).
    has_send_scope: NotRequired[bool]
