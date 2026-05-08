"""Paginated envelope for GET /lease-templates."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.leases.lease_template_summary import LeaseTemplateSummary


class LeaseTemplateListResponse(ListResponse[LeaseTemplateSummary]):
    pass
