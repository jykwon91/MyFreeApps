from datetime import datetime
from typing import NotRequired, TypedDict


class IntegrationInfo(TypedDict):
    provider: str
    last_synced_at: datetime | None
    connected: bool
    # Gmail-specific fields. Present when ``provider == 'gmail'``; absent for others.
    # has_send_scope: pre-PR-2.3 integrations lack gmail.send — host must reconnect.
    # needs_reauth: refresh token was rejected by Google — all Gmail calls will fail.
    # last_reauth_error: short repr of the RefreshError for diagnostics.
    has_send_scope: NotRequired[bool]
    needs_reauth: NotRequired[bool]
    last_reauth_error: NotRequired[str | None]
