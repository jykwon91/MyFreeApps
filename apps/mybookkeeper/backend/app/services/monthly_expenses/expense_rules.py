"""What counts as money spent, and under which heading. Pure.

Spent: every expense, plus loan and mortgage payments — which the bank sync
often files as transfers, because the money moved to a lender.

Not spent: paying off a credit card (the purchases on the card are what was
spent), money moved between your own accounts, money sent to yourself
elsewhere, and interest a lender adds to a loan's balance (the payment is the
money that left).

A loan or mortgage payment is recognised by any of:
  * it is a transfer into one of your loan or mortgage accounts;
  * it went to a payee you said is a mortgage or a loan — what catches a
    mortgage paid under your own name ("<Your Name> External F ...") or by a
    lender's ACH the bank doesn't call a loan payment;
  * its amount is exactly the monthly payment of a mortgage you track — what
    catches a mortgage paid by a plain bank transfer the bank can't pair;
  * the bank called it a loan payment and no matching payment landed on one
    of your cards.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterable, Mapping, Sequence

from app.core.cents import to_cents
from app.core.financial_account_enums import (
    ACCOUNT_TYPE_CREDIT_CARD,
    ACCOUNT_TYPE_LOAN,
    ACCOUNT_TYPE_MORTGAGE,
    ACCOUNT_TYPE_OTHER_LIABILITY,
)
from app.core.monthly_expense_constants import (
    CARD_PAYMENT_MATCH_WINDOW_DAYS,
    CATEGORY_TO_EXPENSE_LABEL,
    LABEL_LOANS,
    LABEL_MORTGAGE,
    LABEL_OTHER,
    PFC_LOAN_PAYMENTS,
    PFC_TO_EXPENSE_LABEL,
    PFC_TRANSFER_OUT,
)
from app.core.tags import TRANSACTION_TYPE_TRANSFER
from app.repositories.monthly_expenses.card_payment_arrival import CardPaymentArrival
from app.repositories.monthly_expenses.expense_row import ExpenseRow
from app.repositories.monthly_expenses.monthly_expense_repo import MortgagePaymentParts
from app.services.monthly_expenses.expense_context import ExpenseContext
from app.core.payee_keys import payee_key
from app.services.transactions.self_transfer import names_holder

# Accounts that owe money on a loan. What is charged to them is interest, not
# money out of pocket.
_LOAN_ACCOUNT_TYPES = frozenset({ACCOUNT_TYPE_LOAN, ACCOUNT_TYPE_MORTGAGE})
_OTHER_LOAN_ACCOUNT_TYPES = frozenset({ACCOUNT_TYPE_LOAN, ACCOUNT_TYPE_OTHER_LIABILITY})
_MONEY_MOVEMENT_CATEGORIES = frozenset({PFC_LOAN_PAYMENTS, PFC_TRANSFER_OUT})


def mortgage_payment_cents(parts: Iterable[MortgagePaymentParts]) -> frozenset[int]:
    """Each tracked mortgage's whole monthly payment (principal + interest +
    escrow). A mortgage missing its principal or interest has no payment to
    recognise."""
    payments: set[int] = set()
    for principal, interest, escrow in parts:
        if principal is None or interest is None:
            continue
        payments.add(principal + interest + (escrow or 0))
    return frozenset(payments)


def _is_unpaired_loan_payment(row: ExpenseRow) -> bool:
    return (
        row.external_category == PFC_LOAN_PAYMENTS
        and row.account_type != ACCOUNT_TYPE_CREDIT_CARD
        and row.to_account_type is None
    )


def card_payment_ids(rows: Sequence[ExpenseRow], arrivals: Sequence[CardPaymentArrival]) -> frozenset[uuid.UUID]:
    """The loan-payment rows that paid one of your cards: a payment of the same
    amount landed on a card within a few days. Each card payment matches one
    row, nearest date first."""
    claimed: set[int] = set()
    matched: set[uuid.UUID] = set()
    for row in sorted((r for r in rows if _is_unpaired_loan_payment(r)), key=lambda r: (r.transaction_date, str(r.id))):
        candidates = [
            index for index, arrival in enumerate(arrivals)
            if index not in claimed
            and arrival.amount == row.amount
            and abs((arrival.transaction_date - row.transaction_date).days) <= CARD_PAYMENT_MATCH_WINDOW_DAYS
        ]
        if not candidates:
            continue
        nearest = min(candidates, key=lambda i: abs((arrivals[i].transaction_date - row.transaction_date).days))
        claimed.add(nearest)
        matched.add(row.id)
    return frozenset(matched)


def _is_sent_to_self(row: ExpenseRow, holder_names: Mapping[uuid.UUID, str]) -> bool:
    """Money sent out under the account holder's own name ("Jason Kwon (Sent)")
    went to another of their accounts, not to someone else."""
    holder = holder_names.get(row.account_user_id) if row.account_user_id else None
    return names_holder((row.description, row.vendor), holder)


def category_label(row: ExpenseRow) -> str:
    """The person's own category first, then MBK's, then the bank's."""
    if row.spending_category_name:
        return row.spending_category_name
    if row.category in CATEGORY_TO_EXPENSE_LABEL:
        return CATEGORY_TO_EXPENSE_LABEL[row.category]
    if row.external_category in PFC_TO_EXPENSE_LABEL:
        return PFC_TO_EXPENSE_LABEL[row.external_category]
    return LABEL_OTHER


def expense_label(row: ExpenseRow, context: ExpenseContext) -> str | None:
    """The heading ``row`` is spent under, or None when it isn't spending."""
    if row.account_type in _LOAN_ACCOUNT_TYPES:
        return None
    is_transfer = row.transaction_type == TRANSACTION_TYPE_TRANSFER
    if is_transfer and row.to_account_type is not None:
        if row.to_account_type == ACCOUNT_TYPE_MORTGAGE:
            return LABEL_MORTGAGE
        if row.to_account_type in _OTHER_LOAN_ACCOUNT_TYPES:
            return LABEL_LOANS
        return None
    tagged = context.loan_payee_labels.get(payee_key(row.vendor, row.description) or "")
    if tagged is not None:
        return tagged
    if row.id in context.card_payments:
        return None
    moves_money = is_transfer or row.external_category in _MONEY_MOVEMENT_CATEGORIES
    if moves_money and row.account_type != ACCOUNT_TYPE_CREDIT_CARD and to_cents(row.amount) in context.mortgage_payments:
        return LABEL_MORTGAGE
    if _is_unpaired_loan_payment(row):
        return LABEL_LOANS
    if is_transfer or row.external_category == PFC_LOAN_PAYMENTS:
        # The card's own side of a card payment, or money between accounts.
        return None
    if row.external_category == PFC_TRANSFER_OUT and _is_sent_to_self(row, context.holder_names):
        return None
    return category_label(row)
