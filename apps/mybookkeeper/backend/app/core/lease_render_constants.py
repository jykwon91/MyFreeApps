"""Constants for rendering and writing lease documents."""
from __future__ import annotations

LEASE_CHANGED_DURING_RENDER_DETAIL = (
    "This lease changed while I was generating. Refresh and try again."
)

# Machine codes the clients branch on; the messages are only human copy.
LEASE_DOCUMENTS_LOCKED_CODE = "LEASE_DOCUMENTS_LOCKED"
LEASE_DOCUMENTS_LOCKED_MESSAGE = (
    "This lease has been sent or signed, so its documents can no longer be "
    "regenerated. You can still add new documents."
)

LEASE_ATTACHMENT_LOCKED_CODE = "LEASE_ATTACHMENT_LOCKED"
LEASE_ATTACHMENT_LOCKED_MESSAGE = (
    "This lease has been sent or signed, so its original and signed documents "
    "can't be deleted or relabelled."
)

LEASE_VALUE_LOCKED_CODE = "LEASE_VALUE_LOCKED"
LEASE_VALUE_LOCKED_MESSAGE = (
    "Some of those values are already on a sent, emailed or signed lease and "
    "can't be changed."
)
