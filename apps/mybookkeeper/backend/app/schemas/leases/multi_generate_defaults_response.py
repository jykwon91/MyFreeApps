"""Response schema for POST /lease-templates/generate-defaults (multi-template).

Returns the merged set of placeholders across N templates plus the resolved
default value and provenance for each one. The merge rule is
**first-template-wins** for ``default_source``: a placeholder defined in
templates A, B, C uses A's resolved value/provenance.
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict

from app.schemas.leases.lease_template_placeholder_response import (
    LeaseTemplatePlaceholderResponse,
)


class MergedPlaceholder(BaseModel):
    """A placeholder, with the IDs of every template that defines it."""

    placeholder: LeaseTemplatePlaceholderResponse
    template_ids: list[uuid.UUID]
    # Resolved default for this placeholder using the FIRST template that
    # defines it. ``value`` is None when no source resolved.
    value: str | None = None
    # "applicant" | "inquiry" | "today" | None
    provenance: str | None = None

    model_config = ConfigDict(from_attributes=False)


class MultiGenerateDefaultsResponse(BaseModel):
    """Merged placeholders and resolved defaults for a multi-template draft."""

    placeholders: list[MergedPlaceholder]

    model_config = ConfigDict(from_attributes=False)
