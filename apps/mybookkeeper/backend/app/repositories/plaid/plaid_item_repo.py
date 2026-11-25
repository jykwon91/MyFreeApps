"""Repository for ``plaid_items``.

Reads made for a person are scoped to the organization AND the user. The
webhook and the daily sync have no person in front of them: they look an item
up by Plaid's id (the webhook's signature is verified first) or by its own id.
"""
from __future__ import annotations

import uuid

from platform_shared.repositories.audited_writes import delete_rows
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.plaid_item_enums import PLAID_ITEM_STATUS_ACTIVE
from app.models.integrations.plaid_item import PlaidItem


async def create(db: AsyncSession, item: PlaidItem) -> PlaidItem:
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def save(db: AsyncSession) -> None:
    """Write the changes made to an item (status, cursor, errors)."""
    await db.flush()


async def get_for_user(
    db: AsyncSession,
    *,
    item_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> PlaidItem | None:
    result = await db.execute(select(PlaidItem).where(
        PlaidItem.id == item_id,
        PlaidItem.user_id == user_id,
        PlaidItem.organization_id == organization_id,
    ))
    return result.scalar_one_or_none()


async def lock(db: AsyncSession, item_id: uuid.UUID) -> PlaidItem | None:
    """The item, row-locked for the rest of the transaction, so two syncs of
    one item never apply the same page or race on the cursor."""
    result = await db.execute(
        select(PlaidItem)
        .where(PlaidItem.id == item_id)
        .with_for_update()
        .execution_options(populate_existing=True),
    )
    return result.scalar_one_or_none()


async def get_by_plaid_item_id(db: AsyncSession, plaid_item_id: str) -> PlaidItem | None:
    result = await db.execute(select(PlaidItem).where(PlaidItem.plaid_item_id == plaid_item_id))
    return result.scalar_one_or_none()


async def list_for_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> list[PlaidItem]:
    result = await db.execute(
        select(PlaidItem)
        .where(PlaidItem.user_id == user_id, PlaidItem.organization_id == organization_id)
        .order_by(PlaidItem.institution_name, PlaidItem.created_at),
    )
    return list(result.scalars().all())


async def list_for_user_all_orgs(db: AsyncSession, user_id: uuid.UUID) -> list[PlaidItem]:
    """Every connection the person made, in any workspace (account deletion)."""
    result = await db.execute(select(PlaidItem).where(PlaidItem.user_id == user_id))
    return list(result.scalars().all())


async def list_active_ids(db: AsyncSession) -> list[uuid.UUID]:
    """Connections the daily sync should pull. One needing re-auth is left
    alone until the person reconnects — Plaid would only refuse again."""
    result = await db.execute(
        select(PlaidItem.id)
        .where(PlaidItem.status == PLAID_ITEM_STATUS_ACTIVE)
        .order_by(PlaidItem.created_at),
    )
    return list(result.scalars().all())


async def delete(db: AsyncSession, item_id: uuid.UUID) -> bool:
    return bool(await delete_rows(db, PlaidItem, PlaidItem.id == item_id))
