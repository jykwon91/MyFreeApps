"""Whether a rent receipt can be sent: one set of rules for the list and the send.

The pending list shows a blocker before the host taps Send; ``send_receipt``
refuses with the matching error. Both decide here, so they can't disagree.
"""
from __future__ import annotations

import uuid

from app.models.integrations.integration import Integration
from app.schemas.leases.receipt_gmail_state import ReceiptGmailState
from app.schemas.leases.receipt_send_blocker import ReceiptSendBlocker
from app.services.integrations import integration_service
from app.services.leases.exceptions import (
    ReceiptGmailReauthError,
    ReceiptMissingApplicantEmailError,
    ReceiptMissingIntegrationError,
    ReceiptMissingLeaseError,
    ReceiptMissingSendScopeError,
    ReceiptTenantOfOtherMemberError,
    ReceiptTransactionNotAttributedError,
)

ReceiptBlockerError = (
    ReceiptTransactionNotAttributedError
    | ReceiptTenantOfOtherMemberError
    | ReceiptMissingApplicantEmailError
    | ReceiptMissingLeaseError
)
ReceiptGmailError = (
    ReceiptMissingIntegrationError | ReceiptMissingSendScopeError | ReceiptGmailReauthError
)


def resolve_tenant_email(contact_email: str | None, inquirer_email: str | None) -> str | None:
    """The tenant's own email first, then the one their inquiry came from, as leases do."""
    return contact_email or inquirer_email or None


def receipt_send_blocker(
    *,
    attributed: bool,
    tenant_owner_id: uuid.UUID | None,
    requester_id: uuid.UUID,
    tenant_email: str | None,
    has_lease: bool,
) -> ReceiptSendBlocker | None:
    """``tenant_owner_id`` is None when the tenant was deleted: no longer attributed."""
    if not attributed or tenant_owner_id is None:
        return "not_attributed"
    if tenant_owner_id != requester_id:
        return "tenant_of_other_member"
    if not tenant_email:
        return "tenant_no_email"
    if not has_lease:
        return "no_lease"
    return None


def receipt_gmail_state(integration: Integration | None) -> ReceiptGmailState:
    if integration is None:
        return "not_connected"
    if not integration_service.integration_has_send_scope(integration):
        return "needs_send_permission"
    if integration.needs_reauth:
        return "needs_reconnect"
    return "ready"


def blocker_error(blocker: ReceiptSendBlocker) -> ReceiptBlockerError:
    if blocker == "not_attributed":
        return ReceiptTransactionNotAttributedError(
            "This transaction hasn't been attributed to a tenant yet."
        )
    if blocker == "tenant_of_other_member":
        return ReceiptTenantOfOtherMemberError(
            "Another member added this tenant, so only they can send this receipt."
        )
    if blocker == "tenant_no_email":
        return ReceiptMissingApplicantEmailError(
            "Tenant has no email address on file. Cannot send the receipt."
        )
    return ReceiptMissingLeaseError(
        "This tenant has no signed lease to file the receipt under. "
        "Add the lease, then send."
    )


def gmail_state_error(state: ReceiptGmailState) -> ReceiptGmailError:
    if state == "not_connected":
        return ReceiptMissingIntegrationError("Connect Gmail before sending receipts.")
    if state == "needs_send_permission":
        return ReceiptMissingSendScopeError(
            "Gmail send permission missing. Reconnect Gmail to enable receipts.",
        )
    return ReceiptGmailReauthError("Gmail token expired. Reconnect Gmail to send receipts.")
