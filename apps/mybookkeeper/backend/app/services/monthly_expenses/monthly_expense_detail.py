"""The payments behind one heading, and who got how much. Pure."""
from __future__ import annotations

from collections.abc import Sequence

from app.core.payee_keys import payee_key
from app.mappers.monthly_expense_mapper import to_transaction_response
from app.schemas.monthly_expenses.monthly_expense_payee_response import MonthlyExpensePayeeResponse
from app.schemas.monthly_expenses.monthly_expense_transaction_response import MonthlyExpenseTransactionResponse
from app.services.monthly_expenses.counted_expense import CountedExpense


def transactions_for(counted: Sequence[CountedExpense], label: str) -> list[MonthlyExpenseTransactionResponse]:
    """Every payment counted under ``label``, newest first."""
    rows = [to_transaction_response(c.row) for c in counted if c.label == label]
    return sorted(rows, key=lambda t: (t.date, str(t.id)), reverse=True)


def payee_totals(transactions: Sequence[MonthlyExpenseTransactionResponse]) -> list[MonthlyExpensePayeeResponse]:
    """Each payee's total, who got the most first. Names with one payee key
    (``payee_key``: "Silvia" and "SILVIA") are one payee, shown as it was first spelled."""
    names: dict[str, str] = {}
    cents: dict[str, int] = {}
    counts: dict[str, int] = {}
    for transaction in sorted(transactions, key=lambda t: (t.date, str(t.id))):
        key = payee_key(transaction.payee, None) or ""
        names.setdefault(key, transaction.payee)
        cents[key] = cents.get(key, 0) + transaction.amount_cents
        counts[key] = counts.get(key, 0) + 1
    return [
        MonthlyExpensePayeeResponse(payee=names[key], total_cents=cents[key], transaction_count=counts[key])
        for key in sorted(cents, key=lambda k: (-cents[k], names[k].casefold()))
    ]
