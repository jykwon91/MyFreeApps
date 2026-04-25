"""Plaid integration endpoints — thin wrappers delegating to plaid_service."""
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.integrations.plaid import (
    ExchangeRequest,
    LinkTokenResponse,
    PlaidAccountRead,
    PlaidAccountUpdate,
    PlaidItemRead,
    PlaidSyncResponse,
)
from app.services.integrations import plaid_service

router = APIRouter(prefix="/plaid", tags=["plaid"])


@router.post("/link-token")
async def create_plaid_link_token(
    ctx: RequestContext = Depends(require_write_access),
) -> LinkTokenResponse:
    result = await plaid_service.create_link(ctx)
    return LinkTokenResponse(**result)


@router.post("/exchange")
async def exchange_plaid_token(
    body: ExchangeRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> PlaidItemRead:
    item = await plaid_service.exchange_and_create_item(
        ctx, body.public_token, body.institution_id, body.institution_name,
    )
    return PlaidItemRead.model_validate(item)


@router.get("/items")
async def list_plaid_items(
    ctx: RequestContext = Depends(current_org_member),
) -> list[PlaidItemRead]:
    items = await plaid_service.list_items(ctx)
    return [PlaidItemRead.model_validate(i) for i in items]


@router.get("/items/{item_id}/accounts")
async def list_item_accounts(
    item_id: UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> list[PlaidAccountRead]:
    accounts = await plaid_service.get_item_accounts(ctx, item_id)
    return [PlaidAccountRead.model_validate(a) for a in accounts]


@router.patch("/accounts/{account_id}")
async def update_account_mapping(
    account_id: UUID,
    body: PlaidAccountUpdate,
    ctx: RequestContext = Depends(require_write_access),
) -> PlaidAccountRead:
    account = await plaid_service.update_account_property(
        ctx, account_id, body.property_id,
    )
    return PlaidAccountRead.model_validate(account)


@router.delete("/items/{item_id}", status_code=204)
async def disconnect_plaid_item(
    item_id: UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    await plaid_service.disconnect_item(ctx, item_id)


@router.post("/items/{item_id}/sync")
async def sync_plaid_item_route(
    item_id: UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> PlaidSyncResponse:
    count = await plaid_service.trigger_sync(ctx, item_id)
    return PlaidSyncResponse(status="success", records_added=count)
