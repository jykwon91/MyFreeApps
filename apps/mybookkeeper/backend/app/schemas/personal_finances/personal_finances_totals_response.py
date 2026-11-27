"""The personal finances page's figures over the whole range."""
from __future__ import annotations

from pydantic import BaseModel


class PersonalFinancesTotalsResponse(BaseModel):
    income_cents: int
    expenses_cents: int
    mortgages_loans_cents: int
    net_cents: int
