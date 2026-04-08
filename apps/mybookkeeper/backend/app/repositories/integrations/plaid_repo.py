import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integrations.plaid_account import PlaidAccount
from app.models.integrations.plaid_item import PlaidItem


async def create_item(db: AsyncSession, item: PlaidItem) -> PlaidItem:
    db.add(item)
    await db.flush()
    return item


async def get_items_by_org(db: AsyncSession, org_id: uuid.UUID) -> Sequence[PlaidItem]:
    result = await db.execute(
        select(PlaidItem).where(PlaidItem.organization_id == org_id)
    )
    return result.scalars().all()


async def get_item_by_id(
    db: AsyncSession, item_id: uuid.UUID, org_id: uuid.UUID,
) -> PlaidItem | None:
    result = await db.execute(
        select(PlaidItem).where(
            PlaidItem.id == item_id,
            PlaidItem.organization_id == org_id,
        )
    )
    return result.scalar_one_or_none()


async def get_item_by_plaid_id(
    db: AsyncSession, plaid_item_id: str,
) -> PlaidItem | None:
    result = await db.execute(
        select(PlaidItem).where(PlaidItem.plaid_item_id == plaid_item_id)
    )
    return result.scalar_one_or_none()


async def get_active_items(db: AsyncSession) -> Sequence[PlaidItem]:
    result = await db.execute(
        select(PlaidItem).where(PlaidItem.status == "active")
    )
    return result.scalars().all()


async def update_cursor(db: AsyncSession, item: PlaidItem, cursor: str) -> None:
    item.cursor = cursor
    item.last_synced_at = datetime.now(timezone.utc)


async def update_status(
    db: AsyncSession, item: PlaidItem, status: str, error_code: str | None = None,
) -> None:
    item.status = status
    item.error_code = error_code


async def delete_item(db: AsyncSession, item: PlaidItem) -> None:
    await db.delete(item)


async def create_account(db: AsyncSession, account: PlaidAccount) -> PlaidAccount:
    db.add(account)
    await db.flush()
    return account


async def get_accounts_by_item(
    db: AsyncSession, item_id: uuid.UUID,
) -> Sequence[PlaidAccount]:
    result = await db.execute(
        select(PlaidAccount).where(PlaidAccount.plaid_item_id == item_id)
    )
    return result.scalars().all()


async def get_active_accounts_by_item(
    db: AsyncSession, plaid_item_id: uuid.UUID,
) -> dict[str, PlaidAccount]:
    """Return active accounts keyed by plaid_account_id."""
    result = await db.execute(
        select(PlaidAccount).where(
            PlaidAccount.plaid_item_id == plaid_item_id,
            PlaidAccount.is_active.is_(True),
        )
    )
    return {acc.plaid_account_id: acc for acc in result.scalars().all()}


async def get_account_by_id(
    db: AsyncSession, account_id: uuid.UUID, org_id: uuid.UUID,
) -> PlaidAccount | None:
    result = await db.execute(
        select(PlaidAccount).where(
            PlaidAccount.id == account_id,
            PlaidAccount.organization_id == org_id,
        )
    )
    return result.scalar_one_or_none()


async def update_account_property(
    db: AsyncSession, account_id: uuid.UUID, property_id: uuid.UUID | None, org_id: uuid.UUID,
) -> PlaidAccount | None:
    account = await get_account_by_id(db, account_id, org_id)
    if account is None:
        return None
    account.property_id = property_id
    return account
