"""Paginated envelope for GET /welcome-manuals."""
from __future__ import annotations

from platform_shared.schemas.pagination import ListResponse

from app.schemas.welcome_manuals.welcome_manual_summary import WelcomeManualSummary


class WelcomeManualListResponse(ListResponse[WelcomeManualSummary]):
    """Paginated response envelope for GET /welcome-manuals."""
