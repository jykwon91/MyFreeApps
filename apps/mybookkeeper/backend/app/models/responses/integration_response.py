from datetime import datetime
from typing import NotRequired, TypedDict


class IntegrationResponse(TypedDict):
    provider: str
    last_synced_at: datetime | None
    connected: bool
    # Gmail-specific (PR 2.3). Frontend uses this to gate the inquiry-reply
    # composer — pre-PR-2.3 integrations have no ``gmail.send`` scope and
    # need a one-time reconnect.
    has_send_scope: NotRequired[bool]
