"""Schema for a single template link on a signed-lease detail / summary.

Exposes the resolved template name (and version) alongside the id so the
frontend doesn't need a second fetch to render the list of contributing
templates. ``name`` / ``version`` are the template's current values;
``template_name_snapshot`` / ``template_version_snapshot`` are what the lease's
documents were last rendered from (NULL when not rendered, or the version
unknown for links rendered before it was recorded).
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict


class SignedLeaseTemplateLink(BaseModel):
    id: uuid.UUID
    name: str
    version: int
    display_order: int
    template_name_snapshot: str | None
    template_version_snapshot: int | None

    model_config = ConfigDict(from_attributes=False)
