"""A loan and what MBK's mortgage rate watch already concluded about refinancing it."""
from decimal import Decimal

from pydantic import BaseModel


class SavingsMortgageSummary(BaseModel):
    property: str
    lender: str | None
    rate_type: str
    rate_pct: Decimal | None
    balance_dollars: int | None
    # From the rate watch (``mortgage_rate_watch_service``), not researched again.
    refi_verdict: str
    survey_rate_pct: Decimal | None
    refi_monthly_saving_low_dollars: int | None
    refi_monthly_saving_high_dollars: int | None
    refi_breakeven_low_months: int | None
    refi_breakeven_high_months: int | None
