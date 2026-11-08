"""Integration row → the API's view of it."""

from app.core.gmail_label_constants import GMAIL_LABEL_METADATA_KEY
from app.models.integrations.integration import Integration
from app.models.responses.integration_info import IntegrationInfo


def gmail_label_of(integration: Integration) -> str | None:
    """The label this Gmail connection is limited to, or None to sync every email."""
    label = (integration.metadata_ or {}).get(GMAIL_LABEL_METADATA_KEY)
    return label if isinstance(label, str) and label else None


def to_integration_info(integration: Integration, *, has_send_scope: bool) -> IntegrationInfo:
    info: IntegrationInfo = {
        "provider": integration.provider,
        "last_synced_at": integration.last_synced_at,
        "connected": True,
    }
    if integration.provider == "gmail":
        info["has_send_scope"] = has_send_scope
        info["needs_reauth"] = integration.needs_reauth
        info["last_reauth_error"] = integration.last_reauth_error
        info["gmail_label"] = gmail_label_of(integration)
    return info
