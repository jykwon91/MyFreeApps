"""A merchant that charges on a steady cadence: a subscription or a bill."""
import datetime as _dt

from pydantic import BaseModel


class SavingsRecurringCharge(BaseModel):
    merchant: str
    # "weekly", "monthly", "quarterly" or "annual".
    cadence: str
    typical_charge_dollars: float
    yearly_cost_dollars: int
    charges_in_window: int
    last_charged_on: _dt.date
