"""Holdings → the Investments page's response: each line's value and
gain/loss, the totals, and the split by security type. Pure."""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Mapping, Sequence
from decimal import Decimal

from app.core.cents import to_cents
from app.core.financial_account_enums import DEFAULT_CURRENCY
from app.core.investment_enums import PRICE_STALE_AFTER_DAYS
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.investments.holding import Holding
from app.models.investments.security import Security
from app.schemas.investments.holding_allocation_response import HoldingAllocationResponse
from app.schemas.investments.holding_list_response import HoldingListResponse
from app.schemas.investments.holding_response import HoldingResponse
from app.schemas.investments.holding_totals_response import HoldingTotalsResponse

_PERCENT = 100
_PERCENT_DIGITS = 2


def value_cents_for(quantity: Decimal, price: Decimal) -> int:
    return to_cents(quantity * price)


def _percent(part: int, whole: int) -> float | None:
    if whole <= 0:
        return None
    return round(part * _PERCENT / whole, _PERCENT_DIGITS)


def _price(holding: Holding, security: Security) -> tuple[Decimal | None, _dt.date | None]:
    """The account holder's price, or the security's last close without one."""
    if holding.institution_price is not None:
        return holding.institution_price, holding.institution_price_as_of
    return security.close_price, security.close_price_as_of


def _value_cents(holding: Holding, price: Decimal | None) -> int | None:
    if holding.institution_value_cents is not None:
        return holding.institution_value_cents
    if holding.quantity is None or price is None:
        return None
    return value_cents_for(holding.quantity, price)


def is_stale(price_as_of: _dt.date | None, today: _dt.date) -> bool:
    if price_as_of is None:
        return False
    return (today - price_as_of).days > PRICE_STALE_AFTER_DAYS


def to_response(
    holding: Holding, *, security: Security, account: FinancialAccount, today: _dt.date,
) -> HoldingResponse:
    price, price_as_of = _price(holding, security)
    value = _value_cents(holding, price)
    cost = holding.cost_basis_cents
    gain = None if value is None or cost is None else value - cost
    return HoldingResponse(
        id=holding.id,
        financial_account_id=holding.financial_account_id,
        account_name=account.name,
        is_manual=account.plaid_item_id is None,
        security_id=security.id,
        ticker_symbol=security.ticker_symbol,
        name=security.name,
        security_type=security.security_type,
        quantity=holding.quantity,
        price=price,
        price_as_of=price_as_of,
        is_price_stale=is_stale(price_as_of, today),
        value_cents=value,
        cost_basis_cents=cost,
        gain_loss_cents=gain,
        gain_loss_percent=None if gain is None or cost is None else _percent(gain, cost),
        currency=holding.currency,
    )


def _totals(lines: Sequence[HoldingResponse]) -> HoldingTotalsResponse:
    value = sum(line.value_cents or 0 for line in lines)
    known_costs = [line.cost_basis_cents for line in lines if line.cost_basis_cents is not None]
    compared = [line for line in lines if line.gain_loss_cents is not None]
    if not compared:
        return HoldingTotalsResponse(
            value_cents=value, cost_basis_cents=sum(known_costs) if known_costs else None,
        )
    gain = sum(line.gain_loss_cents or 0 for line in compared)
    compared_cost = sum(line.cost_basis_cents or 0 for line in compared)
    return HoldingTotalsResponse(
        value_cents=value,
        cost_basis_cents=sum(known_costs),
        gain_loss_cents=gain,
        gain_loss_percent=_percent(gain, compared_cost),
    )


def _allocation(lines: Sequence[HoldingResponse]) -> list[HoldingAllocationResponse]:
    by_type: dict[str, int] = {}
    for line in lines:
        if line.value_cents is not None:
            by_type[line.security_type] = by_type.get(line.security_type, 0) + line.value_cents
    total = sum(by_type.values())
    return [
        HoldingAllocationResponse(
            security_type=security_type, value_cents=value, percent=_percent(value, total),
        )
        for security_type, value in sorted(by_type.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


def to_list_response(
    holdings: Sequence[Holding],
    *,
    securities: Mapping[uuid.UUID, Security],
    accounts: Mapping[uuid.UUID, FinancialAccount],
    financial_account_id: uuid.UUID | None,
    today: _dt.date,
) -> HoldingListResponse:
    lines = [
        to_response(
            holding,
            security=securities[holding.security_id],
            account=accounts[holding.financial_account_id],
            today=today,
        )
        for holding in holdings
        if holding.security_id in securities and holding.financial_account_id in accounts
    ]
    lines.sort(key=lambda line: (-(line.value_cents or 0), line.ticker_symbol or line.name or ""))
    return HoldingListResponse(
        financial_account_id=financial_account_id,
        currency=lines[0].currency if lines else DEFAULT_CURRENCY,
        holdings=lines,
        totals=_totals(lines),
        allocation=_allocation(lines),
    )
