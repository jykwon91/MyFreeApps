from typing import Literal

from pydantic import BaseModel


class RentalRoiSummary(BaseModel):
    """Portfolio totals.

    ``total_target_monthly_cents`` sums only the properties that have a target;
    ``properties_with_target`` / ``property_count`` say how many that is, and
    ``gap_basis`` says which total the gap was measured against, so the two
    bases are never mixed silently.
    """

    property_count: int
    properties_with_target: int
    total_break_even_monthly_cents: int
    total_target_monthly_cents: int
    total_actual_revenue_monthly_cents: int
    total_gap_monthly_cents: int
    gap_basis: Literal["target", "break_even"]
