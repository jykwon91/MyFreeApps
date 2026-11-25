"""What linking a payment to a tenant makes of the row.

A payment linked to a tenant is rent: rental revenue on Schedule E's rents
line. A row that was something else until now — a bank row Plaid filed as
``uncategorized``, not tax-relevant, often on a personal account — must take
the whole of that, not only the category, or the rent never reaches the tax
return. A row already filed as rental revenue keeps how it was filed.
"""
from __future__ import annotations

from app.core.spending_category_enums import TRANSACTION_SCOPE_RENTAL
from app.core.tags import RENTAL_REVENUE_CATEGORY as RENT_CATEGORY
from app.core.tags import schedule_e_line_after_category_change
from app.models.transactions.transaction import Transaction


def file_as_rent(txn: Transaction) -> None:
    if txn.category == RENT_CATEGORY:
        return
    old_category = txn.category
    txn.schedule_e_line = schedule_e_line_after_category_change(
        txn.schedule_e_line, old_category, RENT_CATEGORY,
    )
    txn.category = RENT_CATEGORY
    txn.tags = [RENT_CATEGORY if tag == old_category else tag for tag in (txn.tags or [])]
    txn.tax_relevant = True
    txn.transaction_scope = TRANSACTION_SCOPE_RENTAL
    txn.spending_category_id = None
