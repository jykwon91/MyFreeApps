"""Paginated envelope for GET /lease-templates."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.leases.lease_template_summary import LeaseTemplateSummary


class LeaseTemplateListResponse(BaseModel):
    items: list[LeaseTemplateSummary]
    total: int
    has_more: bool

    model_config = ConfigDict(from_attributes=True)
