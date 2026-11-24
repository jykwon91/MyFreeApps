"""Every account the caller holds, with totals over the open ones.

Not paginated: a person has a handful of accounts, and the page has to total
all of them anyway.
"""
from __future__ import annotations

from pydantic import BaseModel

from app.schemas.financial_accounts.financial_account_response import FinancialAccountResponse
from app.schemas.financial_accounts.financial_account_totals import FinancialAccountTotals


class FinancialAccountListResponse(BaseModel):
    items: list[FinancialAccountResponse]
    totals: list[FinancialAccountTotals]
