"""Response schema for GET /lease-templates/{id}/generate-defaults.

Returns the resolved default value and provenance for each placeholder that
has a ``default_source`` spec. Placeholders without a ``default_source`` are
omitted — they're manual-entry only.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class PlaceholderDefault(BaseModel):
    """Resolved default for a single placeholder key."""

    key: str
    value: str | None
    # "applicant" | "inquiry" | "today" | None (when nothing resolved)
    provenance: str | None

    model_config = ConfigDict(from_attributes=False)


class GenerateDefaultsResponse(BaseModel):
    """Resolved defaults for all placeholders in a template."""

    defaults: list[PlaceholderDefault]

    model_config = ConfigDict(from_attributes=False)
