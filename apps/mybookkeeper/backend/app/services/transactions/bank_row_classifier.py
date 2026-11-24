"""Classify a bank row the same way for every bank source (CSV import, Plaid).

``signed_amount`` follows the bank-export convention both sources share:
positive is money out (an expense), negative is money in. The vendor name
picks the category; a personal-scope row is never tax-relevant.
"""
from __future__ import annotations

from decimal import Decimal

from app.core.spending_category_enums import TRANSACTION_SCOPE_PERSONAL
from app.core.tags import CATEGORY_TO_SCHEDULE_E, EXPENSE_TAGS, REVENUE_TAGS
from app.schemas.transactions.bank_row_classification import BankRowClassification
from app.services.extraction.sender_category_service import match_sender_category


def classify_bank_row(
    description: str, signed_amount: Decimal, transaction_scope: str,
) -> BankRowClassification:
    transaction_type = "expense" if signed_amount > 0 else "income"
    category = match_sender_category(description) or "uncategorized"
    if category in REVENUE_TAGS:
        transaction_type = "income"
    elif category in EXPENSE_TAGS:
        transaction_type = "expense"

    if transaction_scope == TRANSACTION_SCOPE_PERSONAL:
        # Personal spending is tracked, not deducted.
        category = "other_expense" if transaction_type == "expense" else "uncategorized"
        return BankRowClassification(
            transaction_type=transaction_type, category=category,
            amount=abs(signed_amount), tax_relevant=False, schedule_e_line=None,
        )
    return BankRowClassification(
        transaction_type=transaction_type,
        category=category,
        amount=abs(signed_amount),
        tax_relevant=category != "uncategorized",
        schedule_e_line=CATEGORY_TO_SCHEDULE_E.get(category),
    )
