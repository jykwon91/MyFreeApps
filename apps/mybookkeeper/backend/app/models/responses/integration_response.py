from datetime import datetime
from typing import NotRequired, TypedDict


class IntegrationResponse(TypedDict):
    provider: str
    last_synced_at: datetime | None
    connected: bool
    # Gmail-specific fields (absent for non-Gmail providers).
    # has_send_scope: pre-PR-2.3 integrations lack gmail.send — one-time reconnect needed.
    # needs_reauth: refresh token rejected by Google — user must re-auth.
    # last_reauth_error: short diagnostic string (RefreshError class + message).
    has_send_scope: NotRequired[bool]
    needs_reauth: NotRequired[bool]
    last_reauth_error: NotRequired[str | None]
