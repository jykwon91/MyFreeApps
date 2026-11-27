"""A current utility plan's terms, never its account number."""
import datetime as _dt
from decimal import Decimal

from pydantic import BaseModel


class SavingsUtilitySummary(BaseModel):
    property: str
    service_type: str
    provider: str
    plan_name: str | None
    rate_type: str
    cents_per_kwh_at_1000: Decimal | None
    monthly_base_charge_dollars: float | None
    monthly_cost_after_promo_dollars: float | None
    term_end_date: _dt.date | None
    early_termination_fee_dollars: int | None
    download_mbps: int | None
