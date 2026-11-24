"""Repository for ``financial_accounts``.

Every read is scoped to the organization AND the user: an account is one
person's, like a vendor or a mortgage.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from platform_shared.repositories.audited_writes import update_rows
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_accounts.financial_account import FinancialAccount


async def create(db: AsyncSession, account: FinancialAccount) -> FinancialAccount:
    db.add(account)
    await db.flush()
    await db.refresh(account)
    return account


async def get(
    db: AsyncSession,
    *,
    account_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    include_deleted: bool = False,
) -> FinancialAccount | None:
    stmt = select(FinancialAccount).where(
        FinancialAccount.id == account_id,
        FinancialAccount.user_id == user_id,
        FinancialAccount.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(FinancialAccount.deleted_at.is_(None))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_for_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> list[FinancialAccount]:
    """Every live account, open and closed, in a stable order."""
    stmt = (
        select(FinancialAccount)
        .where(
            FinancialAccount.user_id == user_id,
            FinancialAccount.organization_id == organization_id,
            FinancialAccount.deleted_at.is_(None),
        )
        .order_by(FinancialAccount.name, FinancialAccount.created_at)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_live_by_mortgage(
    db: AsyncSession,
    *,
    mortgage_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> FinancialAccount | None:
    stmt = select(FinancialAccount).where(
        FinancialAccount.mortgage_id == mortgage_id,
        FinancialAccount.organization_id == organization_id,
        FinancialAccount.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    return result.scalars().first()


async def update_fields(
    db: AsyncSession, account: FinancialAccount, fields: dict[str, Any],
) -> FinancialAccount:
    for key, value in fields.items():
        setattr(account, key, value)
    await db.flush()
    await db.refresh(account)
    return account


async def soft_delete(
    db: AsyncSession,
    *,
    account_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    return bool(await update_rows(
        db,
        FinancialAccount,
        FinancialAccount.id == account_id,
        FinancialAccount.user_id == user_id,
        FinancialAccount.organization_id == organization_id,
        FinancialAccount.deleted_at.is_(None),
        values={"deleted_at": _dt.datetime.now(_dt.timezone.utc)},
    ))
