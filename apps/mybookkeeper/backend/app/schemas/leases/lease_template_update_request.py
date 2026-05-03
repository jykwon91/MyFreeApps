"""Schema for PATCH /lease-templates/{id} — name + description only.

Files are immutable on a template; re-upload bumps the version via a
separate endpoint.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class LeaseTemplateUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None

    model_config = ConfigDict(extra="forbid")
