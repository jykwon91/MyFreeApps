"""Repository for ``securities``.

Every read is scoped to the organization AND the user: a person's securities
are theirs, like the accounts that hold them.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterable, Mapping

from platform_shared.repositories.audited_writes import delete_rows, upsert_row
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.investments.holding import Holding
from app.models.investments.security import Security


async def create(db: AsyncSession, security: Security) -> Security:
    db.add(security)
    await db.flush()
    await db.refresh(security)
    return security


async def update_fields(
    db: AsyncSession, security: Security, fields: Mapping[str, object],
) -> Security:
    for key, value in fields.items():
        setattr(security, key, value)
    await db.flush()
    return security


async def upsert_plaid(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    plaid_security_id: str,
    fields: Mapping[str, object],
) -> Security:
    """The person's row for one Plaid security, created or brought up to date."""
    row, _ = await upsert_row(
        db,
        Security,
        Security.organization_id == organization_id,
        Security.user_id == user_id,
        Security.plaid_security_id == plaid_security_id,
        create={
            "organization_id": organization_id,
            "user_id": user_id,
            "plaid_security_id": plaid_security_id,
            **fields,
        },
        update=fields,
    )
    return row


async def find_manual(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    ticker_symbol: str | None,
    name: str | None,
) -> Security | None:
    """A hand-entered security the person already has: by ticker when there is
    one, otherwise by name among their securities without a ticker."""
    stmt = select(Security).where(
        Security.organization_id == organization_id,
        Security.user_id == user_id,
        Security.plaid_security_id.is_(None),
    )
    if ticker_symbol is not None:
        stmt = stmt.where(Security.ticker_symbol == ticker_symbol)
    else:
        stmt = stmt.where(Security.ticker_symbol.is_(None), Security.name == name)
    result = await db.execute(stmt.order_by(Security.created_at))
    return result.scalars().first()


async def list_by_ids(
    db: AsyncSession,
    *,
    security_ids: Iterable[uuid.UUID],
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> list[Security]:
    ids = list(set(security_ids))
    if not ids:
        return []
    result = await db.execute(select(Security).where(
        Security.id.in_(ids),
        Security.organization_id == organization_id,
        Security.user_id == user_id,
    ))
    return list(result.scalars().all())


async def delete_unheld(
    db: AsyncSession, *, user_id: uuid.UUID, organization_id: uuid.UUID,
) -> int:
    """Forget the person's securities that no holding points at any more."""
    held = select(Holding.security_id).where(
        Holding.organization_id == organization_id,
        Holding.user_id == user_id,
    )
    return len(await delete_rows(
        db,
        Security,
        Security.organization_id == organization_id,
        Security.user_id == user_id,
        Security.id.not_in(held),
    ))
