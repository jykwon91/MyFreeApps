"""Request body for POST /signed-leases/{lease_id}/extend.

Extends a signed/active lease's end date. The service renders an extension
addendum PDF from the system-default boilerplate, attaches it to the lease,
appends a ``lease_term_versions`` row, and updates ``signed_leases.ends_on``.

``new_ends_on`` must be strictly after the current ``ends_on`` — the service
enforces this and the schema does not (the schema has no access to the
current value). ``notes`` is the optional free-text rationale that lands on
the rendered addendum. ``email_tenant`` triggers a best-effort send via the
existing ``lease_email_service`` after the DB commit.
"""
from __future__ import annotations

import datetime as _dt

from pydantic import BaseModel, ConfigDict, Field


class ExtendLeaseRequest(BaseModel):
    new_ends_on: _dt.date
    notes: str | None = Field(default=None, max_length=2000)
    email_tenant: bool = False

    model_config = ConfigDict(extra="forbid")
