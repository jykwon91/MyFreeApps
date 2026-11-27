"""An insurance policy's cost and renewal, never its policy number."""
import datetime as _dt

from pydantic import BaseModel


class SavingsInsuranceSummary(BaseModel):
    property: str
    carrier: str | None
    yearly_premium_dollars: int | None
    deductible_dollars: int | None
    coverage_dollars: int | None
    renews_on: _dt.date | None
