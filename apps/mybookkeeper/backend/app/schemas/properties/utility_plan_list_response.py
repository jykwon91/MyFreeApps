"""Paginated list response for utility plans."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.properties.utility_plan_summary import UtilityPlanSummary


class UtilityPlanListResponse(ListResponse[UtilityPlanSummary]):
    pass
