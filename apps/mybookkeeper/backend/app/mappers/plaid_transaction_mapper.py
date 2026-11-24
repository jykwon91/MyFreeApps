"""Turn a Plaid transaction into an MBK transaction. Pure.

Plaid signs amounts the same way bank CSV exports do (positive = money out),
so the shared bank-row classifier files both sources identically.
"""
from __future__ import annotations

import uuid

from app.core.plaid_category_constants import (
    PFC_DETAILED_TO_SPENDING_CATEGORY,
    PFC_DETAILED_UNMAPPED,
    PFC_PRIMARY_TO_SPENDING_CATEGORY,
)
from app.core.plaid_constants import PLAID_EXTERNAL_SOURCE
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.transactions.transaction import Transaction
from app.schemas.plaid.wire.plaid_wire_category import PlaidWireCategory
from app.schemas.plaid.wire.plaid_wire_transaction import PlaidWireTransaction
from app.schemas.transactions.bank_row_classification import BankRowClassification

_VENDOR_MAX_LENGTH = 255


def description_for(txn: PlaidWireTransaction) -> str:
    return (txn.merchant_name or txn.name or "").strip()


def vendor_for(txn: PlaidWireTransaction) -> str | None:
    return description_for(txn)[:_VENDOR_MAX_LENGTH] or None


def external_category_for(txn: PlaidWireTransaction) -> str | None:
    return txn.personal_finance_category.primary if txn.personal_finance_category else None


def spending_category_name_for(category: PlaidWireCategory | None) -> str | None:
    """The default personal category Plaid's category obviously means, or None."""
    if category is None:
        return None
    if category.detailed in PFC_DETAILED_UNMAPPED:
        return None
    if category.detailed and category.detailed in PFC_DETAILED_TO_SPENDING_CATEGORY:
        return PFC_DETAILED_TO_SPENDING_CATEGORY[category.detailed]
    return PFC_PRIMARY_TO_SPENDING_CATEGORY.get(category.primary)


def new_transaction(
    txn: PlaidWireTransaction,
    *,
    account: FinancialAccount,
    classification: BankRowClassification,
    spending_category_id: uuid.UUID | None,
) -> Transaction:
    description = description_for(txn)
    return Transaction(
        id=uuid.uuid4(),
        organization_id=account.organization_id,
        user_id=account.user_id,
        account_id=account.id,
        transaction_date=txn.date,
        tax_year=txn.date.year,
        vendor=vendor_for(txn),
        description=description or None,
        amount=classification.amount,
        transaction_type=classification.transaction_type,
        category=classification.category,
        tags=[classification.category],
        tax_relevant=classification.tax_relevant,
        schedule_e_line=classification.schedule_e_line,
        status="approved",
        is_manual=False,
        is_pending=False,
        external_source=PLAID_EXTERNAL_SOURCE,
        external_id=txn.transaction_id,
        external_category=external_category_for(txn),
        transaction_scope=account.default_transaction_scope,
        spending_category_id=spending_category_id,
    )
