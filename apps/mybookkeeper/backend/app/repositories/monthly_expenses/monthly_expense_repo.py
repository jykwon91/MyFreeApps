"""The rows the monthly expenses page decides over, and what it decides with."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import ColumnElement, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.financial_account_enums import ACCOUNT_TYPE_CREDIT_CARD
from app.core.tags import (
    TRANSACTION_TYPE_EXPENSE,
    TRANSACTION_TYPE_INCOME,
    TRANSACTION_TYPE_TRANSFER,
)
from app.core.transaction_statuses import NOT_MONEY_STATUSES
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.mortgage.mortgage import Mortgage
from app.models.transactions.spending_category import SpendingCategory
from app.models.transactions.transaction import Transaction
from app.repositories.cash_flow.cash_basis import cash_basis_filters
from app.repositories.monthly_expenses.card_payment_arrival import CardPaymentArrival
from app.repositories.monthly_expenses.expense_row import ExpenseRow

MortgagePaymentParts = tuple[int | None, int | None, int | None]


def _live_rows(organization_id: uuid.UUID, start: _dt.date, end: _dt.date) -> list[ColumnElement[bool]]:
    """Live rows dated ``start``..``end``. A row still waiting for review is
    money that really moved, so it counts; a duplicate or a personal transfer
    never does."""
    return [
        Transaction.organization_id == organization_id,
        Transaction.deleted_at.is_(None),
        Transaction.status.not_in(NOT_MONEY_STATUSES),
        Transaction.transaction_date >= start,
        Transaction.transaction_date <= end,
    ]


async def list_outflows(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    start: _dt.date,
    end: _dt.date,
    transaction_scope: str | None,
    bank_history_start: _dt.date | None,
) -> list[ExpenseRow]:
    """Every expense and transfer dated ``start``..``end`` on a cash basis
    (``cash_basis``), with the accounts either side. ``transaction_scope``
    None leaves every scope in."""
    from_account = aliased(FinancialAccount)
    to_account = aliased(FinancialAccount)
    stmt = (
        select(
            Transaction.id,
            Transaction.transaction_date,
            Transaction.amount,
            Transaction.transaction_type,
            Transaction.external_source,
            Transaction.external_category,
            Transaction.category,
            SpendingCategory.name.label("spending_category_name"),
            Transaction.description,
            Transaction.vendor,
            Transaction.account_id,
            # Labelled: both accounts and the category have same-named columns.
            from_account.account_type.label("account_type"),
            from_account.name.label("account_name"),
            from_account.institution_name.label("account_institution"),
            from_account.mask.label("account_mask"),
            from_account.user_id.label("account_user_id"),
            to_account.account_type.label("to_account_type"),
        )
        .outerjoin(SpendingCategory, SpendingCategory.id == Transaction.spending_category_id)
        .outerjoin(from_account, from_account.id == Transaction.account_id)
        .outerjoin(to_account, to_account.id == Transaction.transfer_to_account_id)
        .where(
            *_live_rows(organization_id, start, end),
            *cash_basis_filters(bank_history_start),
            Transaction.transaction_type.in_((TRANSACTION_TYPE_EXPENSE, TRANSACTION_TYPE_TRANSFER)),
        )
        .order_by(Transaction.transaction_date, Transaction.id)
    )
    if transaction_scope is not None:
        stmt = stmt.where(Transaction.transaction_scope == transaction_scope)
    result = await db.execute(stmt)
    return [
        ExpenseRow(
            id=row_id,
            transaction_date=day,
            amount=Decimal(str(amount)),
            transaction_type=kind,
            external_source=source,
            external_category=external_category,
            category=category,
            spending_category_name=spending_category_name,
            description=description,
            vendor=vendor,
            account_id=account_id,
            account_type=account_type,
            account_name=account_name,
            account_institution=account_institution,
            account_mask=account_mask,
            account_user_id=account_user_id,
            to_account_type=to_account_type,
        )
        for (
            row_id, day, amount, kind, source, external_category, category,
            spending_category_name, description, vendor, account_id, account_type,
            account_name, account_institution, account_mask, account_user_id, to_account_type,
        ) in result.all()
    ]


async def list_card_payment_arrivals(
    db: AsyncSession, *, organization_id: uuid.UUID, start: _dt.date, end: _dt.date,
) -> list[CardPaymentArrival]:
    """Money in on a credit card dated ``start``..``end``: the card's side of
    a payment that hasn't been joined to its checking side."""
    result = await db.execute(
        select(Transaction.transaction_date, Transaction.amount)
        .join(FinancialAccount, FinancialAccount.id == Transaction.account_id)
        .where(
            *_live_rows(organization_id, start, end),
            Transaction.transaction_type == TRANSACTION_TYPE_INCOME,
            FinancialAccount.account_type == ACCOUNT_TYPE_CREDIT_CARD,
        )
    )
    return [CardPaymentArrival(transaction_date=day, amount=Decimal(str(amount))) for day, amount in result.all()]


async def list_mortgage_payment_parts(
    db: AsyncSession, *, organization_id: uuid.UUID,
) -> list[MortgagePaymentParts]:
    """(principal, interest, escrow) cents of each tracked mortgage's payment."""
    result = await db.execute(
        select(
            Mortgage.monthly_principal_cents,
            Mortgage.monthly_interest_cents,
            Mortgage.monthly_escrow_cents,
        ).where(Mortgage.organization_id == organization_id, Mortgage.deleted_at.is_(None))
    )
    return [(principal, interest, escrow) for principal, interest, escrow in result.all()]
