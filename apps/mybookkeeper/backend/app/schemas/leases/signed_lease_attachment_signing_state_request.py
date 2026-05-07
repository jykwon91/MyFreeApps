"""Request body for PATCH /signed-leases/{lease_id}/attachments/{attachment_id}/signing-state.

Both fields are independently optional. Sending ``null`` explicitly clears
that party's signature; omitting the field leaves the existing value in
place. The frontend therefore needs to send the full intended state on
every PATCH.
"""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel, ConfigDict


class SignedLeaseAttachmentSigningStateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Sentinel ``UNSET`` semantics — if a key is absent from the JSON body,
    # the field stays untouched on the row. Pydantic 2 exposes the absence
    # via ``model_fields_set`` so the service layer can tell "send null
    # explicitly to clear" from "field omitted".
    signed_by_tenant_at: _dt.datetime | None = None
    signed_by_landlord_at: _dt.datetime | None = None
