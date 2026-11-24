"""The Investments page: list holdings, and add, edit or remove the ones kept
by hand.

Holdings break an account's balance down; they are never counted on their
own. Net worth counts ``financial_accounts.current_balance_cents`` only.
For an account synced from a bank both come from Plaid and are read-only
here. For an investment account kept by hand, the holdings ARE the balance:
after every add, edit or remove the account's balance is set to the sum of
its holdings' values, as of today (cash is a ``cash`` holding), and the net
worth snapshot is retaken. Removing the last holding leaves a balance of
zero, which the person can type over again once the account has no holdings.

No price feed: a hand-entered price is what the person typed, dated the day
they typed it, and flagged as stale on the page after a week.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.financial_account_enums import INVESTMENT_ACCOUNT_TYPES
from app.db.session import unit_of_work
from app.mappers import holding_mapper
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.investments.holding import Holding
from app.models.investments.security import Security
from app.repositories.financial_accounts import financial_account_repo
from app.repositories.investments import holding_repo, security_repo
from app.schemas.investments.holding_create_request import HoldingCreateRequest
from app.schemas.investments.holding_list_response import HoldingListResponse
from app.schemas.investments.holding_response import HoldingResponse
from app.schemas.investments.holding_update_request import HoldingUpdateRequest
from app.services.investments.duplicate_holding_error import DuplicateHoldingError
from app.services.investments.holding_not_found_error import HoldingNotFoundError
from app.services.investments.invalid_holding_error import InvalidHoldingError
from app.services.net_worth import net_worth_service

_NOT_INVESTMENT = "Holdings can only be added to a brokerage, retirement or HSA account"
_SYNCED = "This account's holdings come from the bank; they update on each sync"
_UNIDENTIFIED = "Give the holding a ticker or a name"
_DUPLICATE = "This account already holds that; edit the existing holding instead"


async def list_holdings(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    financial_account_id: uuid.UUID | None,
) -> HoldingListResponse:
    async with unit_of_work() as db:
        if financial_account_id is not None:
            await _get_account(db, financial_account_id, user_id=user_id, organization_id=organization_id)
        holdings = await holding_repo.list_for_user(
            db,
            user_id=user_id,
            organization_id=organization_id,
            financial_account_id=financial_account_id,
        )
        securities = await security_repo.list_by_ids(
            db,
            security_ids=(h.security_id for h in holdings),
            user_id=user_id,
            organization_id=organization_id,
        )
        accounts = await financial_account_repo.list_for_user(
            db, user_id=user_id, organization_id=organization_id,
        )
        return holding_mapper.to_list_response(
            holdings,
            securities={s.id: s for s in securities},
            accounts={a.id: a for a in accounts},
            financial_account_id=financial_account_id,
            today=_dt.date.today(),
        )


async def create_holding(
    *, user_id: uuid.UUID, organization_id: uuid.UUID, payload: HoldingCreateRequest,
) -> HoldingResponse:
    today = _dt.date.today()
    async with unit_of_work() as db:
        account = await _get_account(
            db, payload.financial_account_id, user_id=user_id, organization_id=organization_id,
        )
        _assert_manual_investment_account(account)
        security = await _resolve_security(
            db,
            user_id=user_id,
            organization_id=organization_id,
            ticker_symbol=payload.ticker_symbol,
            name=payload.name,
            security_type=payload.security_type,
        )
        if await holding_repo.find_in_account(
            db, financial_account_id=account.id, security_id=security.id,
        ) is not None:
            raise DuplicateHoldingError(_DUPLICATE)
        holding = await holding_repo.create(db, Holding(
            organization_id=organization_id,
            user_id=user_id,
            financial_account_id=account.id,
            security_id=security.id,
            quantity=payload.quantity,
            institution_price=payload.price,
            institution_price_as_of=today,
            institution_value_cents=holding_mapper.value_cents_for(payload.quantity, payload.price),
            cost_basis_cents=payload.cost_basis_cents,
            currency=account.currency,
        ))
        await _rebalance(db, account, today=today)
        return holding_mapper.to_response(holding, security=security, account=account, today=today)


async def update_holding(
    *,
    holding_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    payload: HoldingUpdateRequest,
) -> HoldingResponse:
    fields = payload.model_dump(exclude_unset=True)
    today = _dt.date.today()
    async with unit_of_work() as db:
        holding, account = await _get_manual_holding(
            db, holding_id, user_id=user_id, organization_id=organization_id,
        )
        security = await _security_after_edit(
            db, holding, fields, user_id=user_id, organization_id=organization_id,
        )
        holding = await holding_repo.update_fields(
            db, holding, _holding_changes(holding, fields, security=security, today=today),
        )
        await security_repo.delete_unheld(db, user_id=user_id, organization_id=organization_id)
        await _rebalance(db, account, today=today)
        return holding_mapper.to_response(holding, security=security, account=account, today=today)


async def delete_holding(
    *, holding_id: uuid.UUID, user_id: uuid.UUID, organization_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        holding, account = await _get_manual_holding(
            db, holding_id, user_id=user_id, organization_id=organization_id,
        )
        await holding_repo.delete(db, holding)
        await security_repo.delete_unheld(db, user_id=user_id, organization_id=organization_id)
        await _rebalance(db, account, today=_dt.date.today())


async def _get_account(
    db: AsyncSession, account_id: uuid.UUID, *, user_id: uuid.UUID, organization_id: uuid.UUID,
) -> FinancialAccount:
    account = await financial_account_repo.get(
        db, account_id=account_id, user_id=user_id, organization_id=organization_id,
    )
    if account is None:
        raise HoldingNotFoundError(str(account_id))
    return account


def _assert_manual_investment_account(account: FinancialAccount) -> None:
    if account.account_type not in INVESTMENT_ACCOUNT_TYPES:
        raise InvalidHoldingError(_NOT_INVESTMENT)
    if account.plaid_item_id is not None:
        raise InvalidHoldingError(_SYNCED)


async def _get_manual_holding(
    db: AsyncSession, holding_id: uuid.UUID, *, user_id: uuid.UUID, organization_id: uuid.UUID,
) -> tuple[Holding, FinancialAccount]:
    holding = await holding_repo.get(
        db, holding_id=holding_id, user_id=user_id, organization_id=organization_id,
    )
    if holding is None:
        raise HoldingNotFoundError(str(holding_id))
    account = await _get_account(
        db, holding.financial_account_id, user_id=user_id, organization_id=organization_id,
    )
    if account.plaid_item_id is not None:
        raise InvalidHoldingError(_SYNCED)
    return holding, account


async def _resolve_security(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    ticker_symbol: str | None,
    name: str | None,
    security_type: str,
) -> Security:
    """The person's hand-entered security for this ticker (or, without one,
    name), brought up to date with what they typed, or a new one."""
    if ticker_symbol is None and name is None:
        raise InvalidHoldingError(_UNIDENTIFIED)
    existing = await security_repo.find_manual(
        db,
        user_id=user_id,
        organization_id=organization_id,
        ticker_symbol=ticker_symbol,
        name=name,
    )
    if existing is None:
        return await security_repo.create(db, Security(
            organization_id=organization_id,
            user_id=user_id,
            ticker_symbol=ticker_symbol,
            name=name,
            security_type=security_type,
        ))
    changes: dict[str, object] = {"security_type": security_type}
    if name is not None:
        changes["name"] = name
    return await security_repo.update_fields(db, existing, changes)


async def _security_after_edit(
    db: AsyncSession,
    holding: Holding,
    fields: dict[str, Any],
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> Security:
    current = (await security_repo.list_by_ids(
        db, security_ids=[holding.security_id], user_id=user_id, organization_id=organization_id,
    ))[0]
    if not {"ticker_symbol", "name", "security_type"} & fields.keys():
        return current
    security = await _resolve_security(
        db,
        user_id=user_id,
        organization_id=organization_id,
        ticker_symbol=fields.get("ticker_symbol", current.ticker_symbol),
        name=fields.get("name", current.name),
        security_type=fields.get("security_type") or current.security_type,
    )
    if security.id != current.id and await holding_repo.find_in_account(
        db, financial_account_id=holding.financial_account_id, security_id=security.id,
    ) is not None:
        raise DuplicateHoldingError(_DUPLICATE)
    return security


def _holding_changes(
    holding: Holding, fields: dict[str, Any], *, security: Security, today: _dt.date,
) -> dict[str, object]:
    quantity: Decimal = fields.get("quantity") or holding.quantity or Decimal(0)
    price: Decimal = fields["price"] if fields.get("price") is not None else (
        holding.institution_price or Decimal(0)
    )
    changes: dict[str, object] = {
        "security_id": security.id,
        "quantity": quantity,
        "institution_value_cents": holding_mapper.value_cents_for(quantity, price),
    }
    if fields.get("price") is not None:
        changes["institution_price"] = price
        changes["institution_price_as_of"] = today
    if "cost_basis_cents" in fields:
        changes["cost_basis_cents"] = fields["cost_basis_cents"]
    return changes


async def _rebalance(db: AsyncSession, account: FinancialAccount, *, today: _dt.date) -> None:
    """A hand-kept investment account's balance is its holdings' total."""
    holdings = await holding_repo.list_for_account(db, account.id)
    total = sum(h.institution_value_cents or 0 for h in holdings)
    await financial_account_repo.update_fields(
        db, account, {"current_balance_cents": total, "balance_as_of": today},
    )
    await net_worth_service.record_today(
        db, organization_id=account.organization_id, user_id=account.user_id, today=today,
    )
