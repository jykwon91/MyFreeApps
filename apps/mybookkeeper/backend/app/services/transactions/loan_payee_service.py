"""Payees whose payments count as a mortgage or a loan.

Tagging a payee from one of its transactions remembers the payee, so every
payment to it, past and future, counts under "Mortgage" or "Car & other
loans" in Cash flow and Monthly expenses (``expense_rules``). The rule is
applied when the totals are read; no transaction row changes.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.monthly_expense_constants import UNKNOWN_PAYEE
from app.core.payee_keys import payee_name
from app.core.tags import TRANSACTION_TYPE_INCOME
from app.db.session import unit_of_work
from app.models.transactions.transaction import Transaction
from app.repositories.transactions import loan_payee_repo, transaction_repo
from app.schemas.transactions.loan_payee_kind import LoanPayeeKind
from app.schemas.transactions.loan_payee_read import LoanPayeeRead


class TransactionNotFoundError(ValueError):
    pass


class NotALoanPaymentError(ValueError):
    pass


def _can_tag(txn: Transaction, payee: str) -> bool:
    return txn.transaction_type != TRANSACTION_TYPE_INCOME and payee != UNKNOWN_PAYEE


async def _live(db: AsyncSession, transaction_id: uuid.UUID, organization_id: uuid.UUID) -> Transaction:
    txn = await transaction_repo.get_by_id(db, transaction_id, organization_id)
    if txn is None or txn.deleted_at is not None:
        raise TransactionNotFoundError("Transaction not found")
    return txn


async def get_for_transaction(*, transaction_id: uuid.UUID, organization_id: uuid.UUID) -> LoanPayeeRead:
    async with unit_of_work() as db:
        txn = await _live(db, transaction_id, organization_id)
        payee = payee_name(txn.vendor, txn.description)
        if not _can_tag(txn, payee):
            return LoanPayeeRead(payee=payee, kind=None, can_tag=False)
        kind = await loan_payee_repo.get_kind(db, organization_id=organization_id, payee=payee)
        return LoanPayeeRead(payee=payee, kind=kind, can_tag=True)


async def tag(
    *, transaction_id: uuid.UUID, organization_id: uuid.UUID, user_id: uuid.UUID, kind: LoanPayeeKind,
) -> LoanPayeeRead:
    """Remember the transaction's payee as a mortgage or a loan. Idempotent.

    Raises ``TransactionNotFoundError`` for a missing or deleted transaction,
    ``NotALoanPaymentError`` for money in or a payment that names nobody.
    """
    async with unit_of_work() as db:
        txn = await _live(db, transaction_id, organization_id)
        payee = payee_name(txn.vendor, txn.description)
        if not _can_tag(txn, payee):
            raise NotALoanPaymentError("Only a payment out to a named payee can be a mortgage or loan payment")
        await loan_payee_repo.remember(
            db, organization_id=organization_id, created_by_user_id=user_id, payee=payee, kind=kind,
        )
        return LoanPayeeRead(payee=payee, kind=kind, can_tag=True)


async def untag(*, transaction_id: uuid.UUID, organization_id: uuid.UUID) -> LoanPayeeRead:
    """Stop counting payments to the transaction's payee as a mortgage or a
    loan. Idempotent."""
    async with unit_of_work() as db:
        txn = await _live(db, transaction_id, organization_id)
        payee = payee_name(txn.vendor, txn.description)
        await loan_payee_repo.forget(db, organization_id=organization_id, payee=payee)
        return LoanPayeeRead(payee=payee, kind=None, can_tag=_can_tag(txn, payee))
