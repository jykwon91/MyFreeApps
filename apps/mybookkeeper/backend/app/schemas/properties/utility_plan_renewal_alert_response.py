"""Dashboard payload for utility plans needing attention.

Only *current* plans appear — a superseded plan whose term lapsed years ago is
history, not an alert. ``expired`` is listed ahead of ``expiring_soon``
because an expired term means money is already leaking.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.properties.utility_plan_summary import UtilityPlanSummary


class UtilityPlanRenewalAlertResponse(BaseModel):
    # Lead time used to build this payload, so the UI can say "in the next N
    # days" without hardcoding a number the backend owns.
    window_days: int
    expired: list[UtilityPlanSummary]
    expiring_soon: list[UtilityPlanSummary]
    total_needing_attention: int

    model_config = ConfigDict(from_attributes=True)
