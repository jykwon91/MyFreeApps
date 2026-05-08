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
    # lease / property / user, or carried over from an earlier
    # ``lease.values`` entry on regenerate). Empty string when no source
    # resolved and no default_source was set.
    value: str
    # ``"applicant"`` / ``"inquiry"`` / ``"lease"`` / ``"property"`` /
    # ``"user"`` / ``"today"`` when ``resolve_default_source`` produced the
    # value. ``None`` when the value either could not be resolved or was
    # carried over from ``lease.values`` (in which case
    # ``is_from_existing_values=True``).
    provenance: str | None
    # True when ``value`` came from the lease's existing ``values`` dict
    # (typical on a regenerate). The frontend uses this to label the field
    # as "saved on lease" — outside the resolver's provenance contract.
    is_from_existing_values: bool = False


class SignedLeaseTemplatePrefillResponse(BaseModel):
    items: list[SignedLeaseTemplatePrefillItem]
