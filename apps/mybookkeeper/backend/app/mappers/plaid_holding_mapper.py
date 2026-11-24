"""Turn Plaid's ``/investments/holdings/get`` rows into security and holding
column values. Pure."""
from __future__ import annotations

from app.core.cents import to_cents
from app.core.financial_account_enums import CURRENCY_LENGTH, DEFAULT_CURRENCY
from app.core.investment_enums import (
    CUSIP_LENGTH,
    ISIN_LENGTH,
    SECURITY_NAME_MAX_LENGTH,
    SECURITY_TYPE_OTHER,
    SECURITY_TYPES,
    TICKER_MAX_LENGTH,
)
from app.core.plaid_constants import (
    PLAID_ERROR_ADDITIONAL_CONSENT_REQUIRED,
    PLAID_ERROR_PRODUCT_NOT_READY,
    PLAID_HOLDINGS_UNAVAILABLE_CODES,
)
from app.core.plaid_item_enums import (
    PLAID_INVESTMENTS_STATUS_CONSENT_REQUIRED,
    PLAID_INVESTMENTS_STATUS_ERROR,
    PLAID_INVESTMENTS_STATUS_NOT_READY,
    PLAID_INVESTMENTS_STATUS_UNAVAILABLE,
)
from app.schemas.plaid.wire.plaid_wire_holding import PlaidWireHolding
from app.schemas.plaid.wire.plaid_wire_security import PlaidWireSecurity

_UNNAMED_SECURITY = "Unnamed security"


def investments_status_for(error_code: str | None) -> str:
    """Where a Plaid refusal of ``/investments/holdings/get`` leaves the
    connection's investments."""
    if error_code == PLAID_ERROR_ADDITIONAL_CONSENT_REQUIRED:
        return PLAID_INVESTMENTS_STATUS_CONSENT_REQUIRED
    if error_code == PLAID_ERROR_PRODUCT_NOT_READY:
        return PLAID_INVESTMENTS_STATUS_NOT_READY
    if error_code in PLAID_HOLDINGS_UNAVAILABLE_CODES:
        return PLAID_INVESTMENTS_STATUS_UNAVAILABLE
    return PLAID_INVESTMENTS_STATUS_ERROR


def security_type_for(plaid_type: str | None) -> str:
    """Plaid's type with spaces as underscores ("mutual fund" → mutual_fund);
    a type this app doesn't know yet, or none, is ``other``."""
    normalised = (plaid_type or "").strip().lower().replace(" ", "_")
    return normalised if normalised in SECURITY_TYPES else SECURITY_TYPE_OTHER


def _currency(code: str | None) -> str:
    upper = (code or "").upper()
    return upper if len(upper) == CURRENCY_LENGTH else DEFAULT_CURRENCY


def _fixed(value: str | None, length: int) -> str | None:
    cleaned = (value or "").strip().upper()
    return cleaned if len(cleaned) == length else None


def security_fields(security: PlaidWireSecurity) -> dict[str, object]:
    ticker = (security.ticker_symbol or "").strip().upper()[:TICKER_MAX_LENGTH] or None
    name = (security.name or "").strip()[:SECURITY_NAME_MAX_LENGTH] or None
    if ticker is None and name is None:
        name = _UNNAMED_SECURITY
    close_price = security.close_price
    return {
        "ticker_symbol": ticker,
        "name": name,
        "security_type": security_type_for(security.type),
        "cusip": _fixed(security.cusip, CUSIP_LENGTH),
        "isin": _fixed(security.isin, ISIN_LENGTH),
        "is_cash_equivalent": bool(security.is_cash_equivalent),
        "close_price": close_price,
        "close_price_as_of": security.close_price_as_of if close_price is not None else None,
        "currency": _currency(security.iso_currency_code),
    }


def holding_fields(holding: PlaidWireHolding) -> dict[str, object]:
    price = holding.institution_price
    return {
        "quantity": holding.quantity,
        "institution_price": price,
        "institution_price_as_of": holding.institution_price_as_of if price is not None else None,
        "institution_value_cents": (
            None if holding.institution_value is None else to_cents(holding.institution_value)
        ),
        "cost_basis_cents": None if holding.cost_basis is None else to_cents(holding.cost_basis),
        "currency": _currency(holding.iso_currency_code),
    }
