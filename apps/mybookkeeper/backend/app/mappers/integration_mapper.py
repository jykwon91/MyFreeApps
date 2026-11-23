"""Integration row → the API's view of it."""

from app.core.gmail_label_constants import GMAIL_LABEL_METADATA_KEY
from app.models.integrations.integration import Integration
from app.models.responses.integration_info import IntegrationInfo
from app.services.email.constants import GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR, GMAIL_SCOPE_MISSING_SYNC_LOG_ERROR

_REAUTH_ERROR_MESSAGES: frozenset[str] = frozenset({
    GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR,
    GMAIL_SCOPE_MISSING_SYNC_LOG_ERROR,
})


def gmail_label_of(integration: Integration) -> str | None:
    """The label this Gmail connection is limited to, or None to sync every email."""
    label = (integration.metadata_ or {}).get(GMAIL_LABEL_METADATA_KEY)
    return label if isinstance(label, str) and label else None


def displayable_reauth_error(stored: str | None) -> str | None:
    """``stored`` if it is fixed copy; the expired-connection line for anything else.

    Rows flagged before the reason was fixed copy hold Google's error text
    (a ``RefreshError`` or ``HttpError`` repr). Reconnecting clears it; until
    then it is shown as the generic line. Stored data is left as-is.
    """
    if not stored or stored in _REAUTH_ERROR_MESSAGES:
        return stored
    return GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR


def to_integration_info(integration: Integration, *, has_send_scope: bool) -> IntegrationInfo:
    info: IntegrationInfo = {
        "provider": integration.provider,
        "last_synced_at": integration.last_synced_at,
        "connected": True,
    }
    if integration.provider == "gmail":
        info["has_send_scope"] = has_send_scope
        info["needs_reauth"] = integration.needs_reauth
        info["last_reauth_error"] = displayable_reauth_error(integration.last_reauth_error)
        info["gmail_label"] = gmail_label_of(integration)
    return info
