"""One page of GET /transactions/page: its rows, how many match the filters across every page, and what they add up to."""
from __future__ import annotations

from decimal import Decimal

from platform_shared.schemas.pagination import ListResponse

from app.schemas.transactions.transaction import TransactionRead


class TransactionListPage(ListResponse[TransactionRead]):
    # Every matching row's amount summed, across every page, so a drill-down's total is never cut short.
    amount_total: Decimal
