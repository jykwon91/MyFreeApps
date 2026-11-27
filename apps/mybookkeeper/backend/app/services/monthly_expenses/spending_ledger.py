"""Every row that counts as money spent over some days, with its heading.

The one place the spending rules (``expense_rules``) are applied to stored
rows, so Monthly expenses, Cash flow's "Mortgages & loans" line and the
personal finances page can't disagree on what was spent. Loads through the
repositories inside the caller's session; the rules are pure.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.loan_payee_constants import LOAN_PAYEE_KIND_TO_LABEL
from app.core.monthly_expense_constants import CARD_PAYMENT_MATCH_WINDOW_DAYS
from app.repositories.monthly_expenses import monthly_expense_repo
from app.repositories.transactions import loan_payee_repo
from app.repositories.user import user_repo
from app.services.monthly_expenses import expense_rules
from app.services.monthly_expenses.counted_expense import CountedExpense
from app.services.monthly_expenses.expense_context import ExpenseContext


async def counted_spending(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    first_day: _dt.date,
    last_day: _dt.date,
    transaction_scope: str | None,
    bank_history_start: _dt.date | None,
    account_id: uuid.UUID | None = None,
    approved_only: bool = False,
) -> list[CountedExpense]:
    """Rows dated ``first_day``..``last_day`` that count as spending, on a
    cash basis (``cash_basis``). ``transaction_scope`` / ``account_id`` None
    is every scope / account; ``approved_only`` as in ``list_outflows``."""
    # A card payment at either edge can have its card's side just outside
    # the days asked for.
    margin = _dt.timedelta(days=CARD_PAYMENT_MATCH_WINDOW_DAYS)
    start, end = first_day - margin, last_day + margin
    rows = await monthly_expense_repo.list_outflows(
        db,
        organization_id=organization_id,
        start=start,
        end=end,
        transaction_scope=transaction_scope,
        bank_history_start=bank_history_start,
        account_id=account_id,
        approved_only=approved_only,
    )
    arrivals = await monthly_expense_repo.list_card_payment_arrivals(
        db, organization_id=organization_id, start=start, end=end,
    )
    mortgage_parts = await monthly_expense_repo.list_mortgage_payment_parts(db, organization_id=organization_id)
    holder_names = await user_repo.holder_names(
        db, user_ids={row.account_user_id for row in rows if row.account_user_id is not None},
    )
    loan_payees = await loan_payee_repo.kinds_by_payee(db, organization_id=organization_id)
    context = ExpenseContext(
        mortgage_payments=expense_rules.mortgage_payment_cents(mortgage_parts),
        card_payments=expense_rules.card_payment_ids(rows, arrivals),
        holder_names=holder_names,
        loan_payee_labels={payee: LOAN_PAYEE_KIND_TO_LABEL[kind] for payee, kind in loan_payees.items()},
    )
    counted: list[CountedExpense] = []
    for row in rows:
        if not first_day <= row.transaction_date <= last_day:
            continue
        label = expense_rules.expense_label(row, context)
        if label is not None:
            counted.append(CountedExpense(row=row, label=label))
    return counted
