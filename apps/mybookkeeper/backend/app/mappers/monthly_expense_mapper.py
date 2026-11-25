"""A counted spending row as the page shows it. Pure."""
from __future__ import annotations

from app.core.cents import to_cents
from app.core.monthly_expense_constants import PAYEE_PREFIXES, UNKNOWN_PAYEE
from app.repositories.monthly_expenses.expense_row import ExpenseRow
from app.schemas.monthly_expenses.monthly_expense_transaction_response import MonthlyExpenseTransactionResponse


def payee_for(row: ExpenseRow) -> str:
    """Who was paid: the merchant, or the person a payment app sent money to."""
    name = (row.vendor or row.description or "").strip()
    folded = name.casefold()
    for prefix in PAYEE_PREFIXES:
        if folded.startswith(prefix) and len(name) > len(prefix):
            return name[len(prefix):].strip()
    return name or UNKNOWN_PAYEE


def to_transaction_response(row: ExpenseRow) -> MonthlyExpenseTransactionResponse:
    payee = payee_for(row)
    description = (row.description or "").strip()
    return MonthlyExpenseTransactionResponse(
        id=row.id,
        date=row.transaction_date,
        payee=payee,
        description=description if description and description != payee else None,
        account_name=row.account_name,
        account_institution=row.account_institution,
        account_mask=row.account_mask,
        amount_cents=to_cents(row.amount),
    )
