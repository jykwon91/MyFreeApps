"""Response body for POST /signed-leases/{lease_id}/template-prefill.

Returned to the frontend after the user picks one or more templates from the
"Add template" modal. The frontend uses this to render a values form with as
many fields auto-filled as possible (so the host doesn't re-type information
already on file), with the remaining placeholders surfaced as empty inputs.
"""
from __future__ import annotations

from pydantic import BaseModel


class SignedLeaseTemplatePrefillItem(BaseModel):
    key: str
    display_label: str
    input_type: str
    required: bool
    # Resolved value (auto-filled from default_source against applicant /
    # lease / property / user). Empty string when no source resolved or no
    # default_source was set on the placeholder.
    value: str
    # ``"applicant"`` / ``"inquiry"`` / ``"lease"`` / ``"property"`` /
    # ``"user"`` / ``"today"`` if a value was resolved, else ``None``.
    provenance: str | None


class SignedLeaseTemplatePrefillResponse(BaseModel):
    items: list[SignedLeaseTemplatePrefillItem]
