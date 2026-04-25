"""Plaid integration business logic — link, exchange, sync, disconnect."""
import uuid
from collections.abc import Sequence

from fastapi import HTTPException

from app.core.context import RequestContext
from app.core.security import encrypt_token
from app.db.session import unit_of_work
from app.integrations.plaid_client import (
    create_link_token,
    exchange_public_token,
    get_accounts,
)
from app.models.integrations.plaid_account import PlaidAccount
from app.models.integrations.plaid_item import PlaidItem
from app.repositories.integrations import plaid_repo
from app.services.integrations.plaid_sync_service import sync_plaid_item


async def create_link(
    ctx: RequestContext,
) -> dict[str, str]:
    """Create a Plaid Link token for the frontend widget."""
    result = create_link_token(ctx.user_id, ctx.organization_id)
    if result is None:
        raise HTTPException(status_code=503, detail="Plaid integration not configured")
    return {"link_token": result.link_token, "expiration": result.expiration}


async def exchange_and_create_item(
    ctx: RequestContext,
    public_token: str,
    institution_id: str | None,
    institution_name: str | None,
) -> PlaidItem:
    """Exchange a public token, create PlaidItem + PlaidAccounts."""
    exchange_result = exchange_public_token(public_token)
    if exchange_result is None:
        raise HTTPException(status_code=503, detail="Plaid integration not configured")

    async with unit_of_work() as db:
        item = PlaidItem(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            plaid_item_id=exchange_result.item_id,
            access_token=encrypt_token(exchange_result.access_token),
            institution_id=institution_id,
            institution_name=institution_name,
        )
        await plaid_repo.create_item(db, item)

        accounts_info = get_accounts(exchange_result.access_token)
        if accounts_info:
            for acc_info in accounts_info:
                account = PlaidAccount(
                    plaid_item_id=item.id,
                    organization_id=ctx.organization_id,
                    plaid_account_id=acc_info.account_id,
                    name=acc_info.name,
                    official_name=acc_info.official_name,
                    account_type=acc_info.account_type,
                    account_subtype=acc_info.account_subtype,
                    mask=acc_info.mask,
                )
                await plaid_repo.create_account(db, account)

    return item


async def list_items(
    ctx: RequestContext,
) -> Sequence[PlaidItem]:
    """List all Plaid items for an organization."""
    async with unit_of_work() as db:
        return await plaid_repo.get_items_by_org(db, ctx.organization_id)


async def get_item_accounts(
    ctx: RequestContext, item_id: uuid.UUID,
) -> Sequence[PlaidAccount]:
    """List accounts for a specific Plaid item."""
    async with unit_of_work() as db:
        item = await plaid_repo.get_item_by_id(db, item_id, ctx.organization_id)
        if not item:
            raise HTTPException(status_code=404, detail="Plaid item not found")
        return await plaid_repo.get_accounts_by_item(db, item.id)


async def update_account_property(
    ctx: RequestContext,
    account_id: uuid.UUID,
    property_id: uuid.UUID | None,
) -> PlaidAccount:
    """Update account-to-property mapping."""
    async with unit_of_work() as db:
        account = await plaid_repo.update_account_property(
            db, account_id, property_id, ctx.organization_id,
        )
        if not account:
            raise HTTPException(status_code=404, detail="Plaid account not found")
        return account


async def disconnect_item(
    ctx: RequestContext, item_id: uuid.UUID,
) -> None:
    """Disconnect a Plaid item."""
    async with unit_of_work() as db:
        item = await plaid_repo.get_item_by_id(db, item_id, ctx.organization_id)
        if not item:
            raise HTTPException(status_code=404, detail="Plaid item not found")
        await plaid_repo.delete_item(db, item)


async def trigger_sync(
    ctx: RequestContext, item_id: uuid.UUID,
) -> int:
    """Manually trigger a sync for a Plaid item. Returns count of records added."""
    async with unit_of_work() as db:
        item = await plaid_repo.get_item_by_id(db, item_id, ctx.organization_id)
        if not item:
            raise HTTPException(status_code=404, detail="Plaid item not found")
        return await sync_plaid_item(db, item, ctx.organization_id, ctx.user_id)
