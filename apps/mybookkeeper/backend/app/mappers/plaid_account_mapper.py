"""Turn the accounts Plaid reports into MBK financial accounts. Pure."""
from __future__ import annotations

import datetime as _dt
import re
import uuid
from decimal import ROUND_HALF_UP, Decimal

from app.core.financial_account_enums import (
    CURRENCY_LENGTH,
    DEFAULT_CURRENCY,
    MASK_MAX_LENGTH,
    NAME_MAX_LENGTH,
)
from app.core.plaid_category_constants import (
    PLAID_FALLBACK_ACCOUNT_TYPE,
    PLAID_SUBTYPE_TO_ACCOUNT_TYPE,
    PLAID_TYPE_TO_ACCOUNT_TYPE,
)
from app.models.financial_accounts.financial_account import FinancialAccount
from app.schemas.plaid.wire.plaid_wire_account import PlaidWireAccount

_MASK_PATTERN = re.compile(r"^[A-Za-z0-9]{2,4}$")
_CENTS = Decimal("0.01")
_FALLBACK_NAME = "Bank account"


def account_type_for(account: PlaidWireAccount) -> str:
    subtype = (account.subtype or "").lower()
    if subtype in PLAID_SUBTYPE_TO_ACCOUNT_TYPE:
        return PLAID_SUBTYPE_TO_ACCOUNT_TYPE[subtype]
    return PLAID_TYPE_TO_ACCOUNT_TYPE.get(account.type.lower(), PLAID_FALLBACK_ACCOUNT_TYPE)


def mask_for(account: PlaidWireAccount) -> str | None:
    """Plaid documents a mask as the last 2-4 characters; anything else is
    cut to its last four so a full number can never be stored."""
    if not account.mask:
        return None
    tail = account.mask.strip()[-MASK_MAX_LENGTH:]
    return tail if _MASK_PATTERN.match(tail) else None


def name_for(account: PlaidWireAccount) -> str:
    name = (account.name or "").strip() or (account.official_name or "").strip()
    return name[:NAME_MAX_LENGTH] or _FALLBACK_NAME


def currency_for(account: PlaidWireAccount) -> str:
    code = (account.balances.iso_currency_code or "").upper()
    return code if len(code) == CURRENCY_LENGTH else DEFAULT_CURRENCY


def balance_cents_for(account: PlaidWireAccount) -> int | None:
    """The bank's current balance in cents: money held on an asset account,
    money owed on a liability — the sign MBK already uses for both."""
    current = account.balances.current
    if current is None:
        return None
    return int((current / _CENTS).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def new_account(
    account: PlaidWireAccount,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    plaid_item_id: uuid.UUID,
    institution_name: str | None,
    default_transaction_scope: str,
    today: _dt.date,
) -> FinancialAccount:
    balance = balance_cents_for(account)
    return FinancialAccount(
        user_id=user_id,
        organization_id=organization_id,
        name=name_for(account),
        institution_name=institution_name,
        account_type=account_type_for(account),
        mask=mask_for(account),
        currency=currency_for(account),
        current_balance_cents=balance,
        balance_as_of=today if balance is not None else None,
        default_transaction_scope=default_transaction_scope,
        plaid_item_id=plaid_item_id,
        plaid_account_id=account.account_id,
    )
