"""A counted spending row as the page shows it. Pure."""
from __future__ import annotations

from app.core.cents import to_cents
from app.repositories.monthly_expenses.expense_row import ExpenseRow
from app.schemas.monthly_expenses.monthly_expense_transaction_response import MonthlyExpenseTransactionResponse
from app.core.payee_keys import payee_name


def payee_for(row: ExpenseRow) -> str:
    """Who was paid: the merchant, or the person a payment app sent money to."""
    return payee_name(row.vendor, row.description)


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
