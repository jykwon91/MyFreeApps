"""Repository for ``holdings``.

Every read is scoped to the organization AND the user, and the person-facing
reads list only holdings of live accounts: a soft-deleted account hides its
holdings with it.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterable, Mapping

from platform_shared.repositories.audited_writes import delete_rows, upsert_row
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.investments.holding import Holding


async def create(db: AsyncSession, holding: Holding) -> Holding:
    db.add(holding)
    await db.flush()
    await db.refresh(holding)
    return holding


async def get(
    db: AsyncSession,
    *,
    holding_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> Holding | None:
    result = await db.execute(
        select(Holding)
        .join(FinancialAccount, FinancialAccount.id == Holding.financial_account_id)
        .where(
            Holding.id == holding_id,
            Holding.user_id == user_id,
            Holding.organization_id == organization_id,
            FinancialAccount.deleted_at.is_(None),
        ),
    )
    return result.scalar_one_or_none()


async def list_for_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    financial_account_id: uuid.UUID | None = None,
) -> list[Holding]:
    stmt = (
        select(Holding)
        .join(FinancialAccount, FinancialAccount.id == Holding.financial_account_id)
        .where(
            Holding.user_id == user_id,
            Holding.organization_id == organization_id,
            FinancialAccount.deleted_at.is_(None),
        )
        .order_by(Holding.financial_account_id, Holding.created_at)
    )
    if financial_account_id is not None:
        stmt = stmt.where(Holding.financial_account_id == financial_account_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_for_account(db: AsyncSession, financial_account_id: uuid.UUID) -> list[Holding]:
    result = await db.execute(
        select(Holding).where(Holding.financial_account_id == financial_account_id),
    )
    return list(result.scalars().all())


async def find_in_account(
    db: AsyncSession, *, financial_account_id: uuid.UUID, security_id: uuid.UUID,
) -> Holding | None:
    result = await db.execute(select(Holding).where(
        Holding.financial_account_id == financial_account_id,
        Holding.security_id == security_id,
    ))
    return result.scalar_one_or_none()


async def count_for_account(db: AsyncSession, financial_account_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(Holding).where(
            Holding.financial_account_id == financial_account_id,
        ),
    )
    return int(result.scalar_one())


async def update_fields(
    db: AsyncSession, holding: Holding, fields: Mapping[str, object],
) -> Holding:
    for key, value in fields.items():
        setattr(holding, key, value)
    await db.flush()
    await db.refresh(holding)
    return holding


async def upsert(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    financial_account_id: uuid.UUID,
    security_id: uuid.UUID,
    fields: Mapping[str, object],
) -> Holding:
    row, _ = await upsert_row(
        db,
        Holding,
        Holding.financial_account_id == financial_account_id,
        Holding.security_id == security_id,
        create={
            "organization_id": organization_id,
            "user_id": user_id,
            "financial_account_id": financial_account_id,
            "security_id": security_id,
            **fields,
        },
        update=fields,
    )
    return row


async def delete(db: AsyncSession, holding: Holding) -> None:
    await db.delete(holding)
    await db.flush()


async def delete_others_in_accounts(
    db: AsyncSession,
    *,
    financial_account_ids: Iterable[uuid.UUID],
    keep_ids: Iterable[uuid.UUID],
) -> int:
    """Remove every holding of these accounts except ``keep_ids``: what a bank
    sync does with the positions the bank no longer reports (sold)."""
    account_ids = list(financial_account_ids)
    if not account_ids:
        return 0
    return len(await delete_rows(
        db,
        Holding,
        Holding.financial_account_id.in_(account_ids),
        Holding.id.not_in(list(keep_ids)),
    ))
