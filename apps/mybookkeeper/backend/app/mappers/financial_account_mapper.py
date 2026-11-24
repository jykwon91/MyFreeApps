"""Turn stored accounts into what the Accounts page shows.

Pure: no database, no I/O. ``classification`` and the totals are derived here
from ``account_type`` and the balances, never stored.
"""
from __future__ import annotations

from collections.abc import Iterable

from app.core.financial_account_enums import (
    ASSET_ACCOUNT_TYPES,
    CLASSIFICATION_ASSET,
    CLASSIFICATION_LIABILITY,
)
from app.models.financial_accounts.financial_account import FinancialAccount
from app.schemas.financial_accounts.financial_account_response import FinancialAccountResponse
from app.schemas.financial_accounts.financial_account_totals import FinancialAccountTotals


def classification_for(account_type: str) -> str:
    if account_type in ASSET_ACCOUNT_TYPES:
        return CLASSIFICATION_ASSET
    return CLASSIFICATION_LIABILITY


def to_response(account: FinancialAccount) -> FinancialAccountResponse:
    return FinancialAccountResponse(
        id=account.id,
        organization_id=account.organization_id,
        user_id=account.user_id,
        name=account.name,
        institution_name=account.institution_name,
        account_type=account.account_type,
        classification=classification_for(account.account_type),
        mask=account.mask,
        currency=account.currency,
        current_balance_cents=account.current_balance_cents,
        balance_as_of=account.balance_as_of,
        closed_on=account.closed_on,
        mortgage_id=account.mortgage_id,
        default_transaction_scope=account.default_transaction_scope,
        plaid_item_id=account.plaid_item_id,
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


def totals_for(accounts: Iterable[FinancialAccount]) -> list[FinancialAccountTotals]:
    """Sum the open accounts that have a balance, one total per currency.

    Closed accounts are history, not money you have or owe. An account with no
    balance recorded adds nothing rather than a guessed zero — the page says
    which accounts are missing one. Currencies are never mixed: adding dollars
    to euros produces a number that means nothing.
    """
    assets: dict[str, int] = {}
    liabilities: dict[str, int] = {}
    for account in accounts:
        if account.closed_on is not None or account.current_balance_cents is None:
            continue
        bucket = assets if account.account_type in ASSET_ACCOUNT_TYPES else liabilities
        bucket[account.currency] = bucket.get(account.currency, 0) + account.current_balance_cents
    currencies = sorted(set(assets) | set(liabilities))
    return [
        FinancialAccountTotals(
            currency=currency,
            assets_cents=assets.get(currency, 0),
            liabilities_cents=liabilities.get(currency, 0),
            net_cents=assets.get(currency, 0) - liabilities.get(currency, 0),
        )
        for currency in currencies
    ]
