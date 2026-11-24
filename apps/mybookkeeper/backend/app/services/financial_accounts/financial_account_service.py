"""Service layer for financial accounts.

All data access goes through repositories; this module never builds a query.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.mappers import financial_account_mapper
from app.models.financial_accounts.financial_account import FinancialAccount
from app.repositories.financial_accounts import financial_account_repo
from app.repositories.mortgage import mortgage_repo
from app.schemas.financial_accounts.financial_account_create_request import (
    FinancialAccountCreateRequest,
)
from app.schemas.financial_accounts.financial_account_list_response import (
    FinancialAccountListResponse,
)
from app.schemas.financial_accounts.financial_account_response import FinancialAccountResponse
from app.schemas.financial_accounts.financial_account_state_rules import validate_account_state

# What a PATCH may change. Anything else in ``fields`` is refused rather than
# silently set.
UPDATABLE_FIELDS = frozenset({
    "name",
    "account_type",
    "institution_name",
    "mask",
    "currency",
    "current_balance_cents",
    "balance_as_of",
    "closed_on",
    "mortgage_id",
})
# Clearing these to null would break a NOT NULL column.
_NOT_NULLABLE_FIELDS = frozenset({"name", "account_type", "currency"})


class FinancialAccountNotFoundError(LookupError):
    pass


class InvalidFinancialAccountError(ValueError):
    """A payload that would leave the account inconsistent or point elsewhere."""


async def _assert_mortgage_available(
    db: AsyncSession,
    *,
    mortgage_id: uuid.UUID | None,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    account_id: uuid.UUID | None = None,
) -> None:
    if mortgage_id is None:
        return
    mortgage = await mortgage_repo.get(
        db, mortgage_id=mortgage_id, user_id=user_id, organization_id=organization_id,
    )
    if mortgage is None:
        raise InvalidFinancialAccountError("mortgage_id does not name a mortgage")
    linked = await financial_account_repo.get_live_by_mortgage(
        db, mortgage_id=mortgage_id, organization_id=organization_id,
    )
    if linked is not None and linked.id != account_id:
        raise InvalidFinancialAccountError(
            f"That mortgage is already linked to the account {linked.name!r}",
        )


def _check_state(account_type: str, merged: dict[str, Any]) -> None:
    try:
        validate_account_state(
            account_type=account_type,
            current_balance_cents=merged.get("current_balance_cents"),
            balance_as_of=merged.get("balance_as_of"),
            mortgage_id=merged.get("mortgage_id"),
        )
    except ValueError as exc:
        raise InvalidFinancialAccountError(str(exc)) from exc


async def list_accounts(
    *, user_id: uuid.UUID, organization_id: uuid.UUID,
) -> FinancialAccountListResponse:
    async with unit_of_work() as db:
        accounts = await financial_account_repo.list_for_user(
            db, user_id=user_id, organization_id=organization_id,
        )
        return FinancialAccountListResponse(
            items=[financial_account_mapper.to_response(a) for a in accounts],
            totals=financial_account_mapper.totals_for(accounts),
        )


async def get_account(
    *, account_id: uuid.UUID, user_id: uuid.UUID, organization_id: uuid.UUID,
) -> FinancialAccountResponse:
    async with unit_of_work() as db:
        account = await financial_account_repo.get(
            db, account_id=account_id, user_id=user_id, organization_id=organization_id,
        )
        if account is None:
            raise FinancialAccountNotFoundError(str(account_id))
        return financial_account_mapper.to_response(account)


async def create_account(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    payload: FinancialAccountCreateRequest,
) -> FinancialAccountResponse:
    values = payload.model_dump()
    _check_state(payload.account_type, values)
    async with unit_of_work() as db:
        await _assert_mortgage_available(
            db,
            mortgage_id=payload.mortgage_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        account = await financial_account_repo.create(
            db,
            FinancialAccount(user_id=user_id, organization_id=organization_id, **values),
        )
        return financial_account_mapper.to_response(account)


async def update_account(
    *,
    account_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    fields: dict[str, Any],
) -> FinancialAccountResponse:
    unknown = set(fields) - UPDATABLE_FIELDS
    if unknown:
        raise InvalidFinancialAccountError(f"Cannot update: {', '.join(sorted(unknown))}")
    cleared = sorted(k for k in _NOT_NULLABLE_FIELDS if k in fields and fields[k] is None)
    if cleared:
        raise InvalidFinancialAccountError(f"Cannot clear: {', '.join(cleared)}")

    async with unit_of_work() as db:
        account = await financial_account_repo.get(
            db, account_id=account_id, user_id=user_id, organization_id=organization_id,
        )
        if account is None:
            raise FinancialAccountNotFoundError(str(account_id))

        merged: dict[str, Any] = {
            "current_balance_cents": account.current_balance_cents,
            "balance_as_of": account.balance_as_of,
            "mortgage_id": account.mortgage_id,
            **fields,
        }
        _check_state(fields.get("account_type", account.account_type), merged)
        if "mortgage_id" in fields:
            await _assert_mortgage_available(
                db,
                mortgage_id=fields["mortgage_id"],
                user_id=user_id,
                organization_id=organization_id,
                account_id=account.id,
            )

        updated = await financial_account_repo.update_fields(db, account, fields)
        return financial_account_mapper.to_response(updated)


async def delete_account(
    *, account_id: uuid.UUID, user_id: uuid.UUID, organization_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        deleted = await financial_account_repo.soft_delete(
            db, account_id=account_id, user_id=user_id, organization_id=organization_id,
        )
        if not deleted:
            raise FinancialAccountNotFoundError(str(account_id))


async def restore_account(
    *, account_id: uuid.UUID, user_id: uuid.UUID, organization_id: uuid.UUID,
) -> FinancialAccountResponse:
    """Undo a delete. Restoring a live account returns it unchanged."""
    async with unit_of_work() as db:
        account = await financial_account_repo.get(
            db,
            account_id=account_id,
            user_id=user_id,
            organization_id=organization_id,
            include_deleted=True,
        )
        if account is None:
            raise FinancialAccountNotFoundError(str(account_id))
        if account.deleted_at is None:
            return financial_account_mapper.to_response(account)
        await _assert_mortgage_available(
            db,
            mortgage_id=account.mortgage_id,
            user_id=user_id,
            organization_id=organization_id,
            account_id=account.id,
        )
        restored = await financial_account_repo.update_fields(db, account, {"deleted_at": None})
        return financial_account_mapper.to_response(restored)
