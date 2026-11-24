"""Connect, list, reconnect and disconnect a person's banks.

Connecting is one step after Link closes: the browser sends the public token
together with what to do with each account (link to an existing account or
add a new one), and the server exchanges the token, checks the accounts
against Plaid's own list, and stores the connection and its accounts in one
transaction. If anything after the exchange fails, the new item is removed at
Plaid again so no live connection is left with nothing pointing at it.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from collections import Counter

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.plaid_constants import PLAID_ERROR_ITEM_NOT_FOUND
from app.core.plaid_item_enums import PLAID_ITEM_STATUS_ACTIVE
from app.db.session import unit_of_work
from app.mappers import plaid_account_mapper, plaid_item_mapper
from app.models.integrations.plaid_item import PlaidItem
from app.repositories.financial_accounts import financial_account_repo
from app.repositories.plaid import plaid_item_repo
from app.schemas.plaid.plaid_account_selection import PlaidAccountSelection
from app.schemas.plaid.plaid_item_create_request import PlaidItemCreateRequest
from app.schemas.plaid.plaid_item_response import PlaidItemResponse
from app.schemas.plaid.plaid_link_token_response import PlaidLinkTokenResponse
from app.schemas.plaid.wire.plaid_wire_account import PlaidWireAccount
from app.services.plaid import plaid_client
from app.services.plaid.invalid_plaid_connection_error import InvalidPlaidConnectionError
from app.services.plaid.plaid_api_error import PlaidApiError
from app.services.plaid.plaid_item_not_found_error import PlaidItemNotFoundError

logger = logging.getLogger(__name__)


async def create_link_token(
    *, user_id: uuid.UUID, organization_id: uuid.UUID, item_id: uuid.UUID | None,
) -> PlaidLinkTokenResponse:
    access_token: str | None = None
    if item_id is not None:
        async with unit_of_work() as db:
            item = await _get_owned(db, item_id, user_id=user_id, organization_id=organization_id)
            access_token = item.access_token
    token = await plaid_client.create_link_token(
        client_user_id=str(user_id), access_token=access_token,
    )
    return PlaidLinkTokenResponse(link_token=token.link_token, expiration=token.expiration)


async def list_items(*, user_id: uuid.UUID, organization_id: uuid.UUID) -> list[PlaidItemResponse]:
    async with unit_of_work() as db:
        items = await plaid_item_repo.list_for_user(
            db, user_id=user_id, organization_id=organization_id,
        )
        accounts = await financial_account_repo.list_for_user(
            db, user_id=user_id, organization_id=organization_id,
        )
    per_item = Counter(a.plaid_item_id for a in accounts if a.plaid_item_id is not None)
    return [plaid_item_mapper.to_response(i, account_count=per_item[i.id]) for i in items]


async def connect(
    *, user_id: uuid.UUID, organization_id: uuid.UUID, payload: PlaidItemCreateRequest,
) -> PlaidItemResponse:
    exchange = await plaid_client.exchange_public_token(payload.public_token)
    access_token = exchange.access_token.get_secret_value()
    try:
        plaid_accounts = {a.account_id: a for a in await plaid_client.get_accounts(access_token)}
        unknown = [s.plaid_account_id for s in payload.accounts if s.plaid_account_id not in plaid_accounts]
        if unknown:
            raise InvalidPlaidConnectionError("An account isn't part of this bank connection")
        async with unit_of_work() as db:
            if await plaid_item_repo.get_by_plaid_item_id(db, exchange.item_id) is not None:
                raise InvalidPlaidConnectionError("This bank connection is already saved")
            item = PlaidItem(
                user_id=user_id,
                organization_id=organization_id,
                plaid_item_id=exchange.item_id,
                institution_id=payload.institution_id,
                institution_name=payload.institution_name,
            )
            item.access_token = access_token
            item = await plaid_item_repo.create(db, item)
            for selection in payload.accounts:
                await _attach_account(
                    db, item, selection, plaid_accounts[selection.plaid_account_id],
                )
            return plaid_item_mapper.to_response(item, account_count=len(payload.accounts))
    except Exception:
        await _remove_quietly(access_token, plaid_item_id=exchange.item_id)
        raise


async def _attach_account(
    db: AsyncSession,
    item: PlaidItem,
    selection: PlaidAccountSelection,
    plaid_account: PlaidWireAccount,
) -> None:
    today = _dt.date.today()
    if selection.financial_account_id is None:
        await financial_account_repo.create(db, plaid_account_mapper.new_account(
            plaid_account,
            user_id=item.user_id,
            organization_id=item.organization_id,
            plaid_item_id=item.id,
            institution_name=item.institution_name,
            default_transaction_scope=selection.default_transaction_scope,
            today=today,
        ))
        return
    account = await financial_account_repo.get(
        db,
        account_id=selection.financial_account_id,
        user_id=item.user_id,
        organization_id=item.organization_id,
    )
    if account is None:
        raise InvalidPlaidConnectionError("An account to link was not found")
    if account.plaid_item_id is not None:
        raise InvalidPlaidConnectionError(f"{account.name} is already synced from a bank")
    fields: dict[str, object] = {
        "plaid_item_id": item.id,
        "plaid_account_id": plaid_account.account_id,
        "default_transaction_scope": selection.default_transaction_scope,
    }
    balance = plaid_account_mapper.balance_cents_for(plaid_account)
    if balance is not None:
        fields["current_balance_cents"] = balance
        fields["balance_as_of"] = today
    if account.mask is None:
        fields["mask"] = plaid_account_mapper.mask_for(plaid_account)
    if account.institution_name is None and item.institution_name:
        fields["institution_name"] = item.institution_name
    await financial_account_repo.update_fields(db, account, fields)


async def mark_reconnected(
    *, item_id: uuid.UUID, user_id: uuid.UUID, organization_id: uuid.UUID,
) -> PlaidItemResponse:
    """Link update mode finished: the bank accepted the new sign-in."""
    async with unit_of_work() as db:
        item = await _get_owned(db, item_id, user_id=user_id, organization_id=organization_id)
        item.status = PLAID_ITEM_STATUS_ACTIVE
        item.error_type = None
        item.error_code = None
        await db.flush()
        accounts = await financial_account_repo.list_by_plaid_item(db, item.id)
        return plaid_item_mapper.to_response(item, account_count=len(accounts))


async def disconnect(*, item_id: uuid.UUID, user_id: uuid.UUID, organization_id: uuid.UUID) -> None:
    """Revoke the connection at Plaid, then forget it. The accounts and every
    transaction stay; they just stop syncing.

    Raises ``PlaidApiError`` (and keeps the connection) when Plaid refuses for
    any reason but "already gone", so the person never believes access was
    revoked when it wasn't.
    """
    async with unit_of_work() as db:
        item = await _get_owned(db, item_id, user_id=user_id, organization_id=organization_id)
        try:
            await plaid_client.remove_item(item.access_token)
        except PlaidApiError as exc:
            if exc.error_code != PLAID_ERROR_ITEM_NOT_FOUND:
                raise
        await financial_account_repo.unlink_plaid_item(db, item.id)
        await plaid_item_repo.delete(db, item.id)


async def list_access_tokens_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    """Every connection's access token for account deletion, read before the
    rows go so they can be revoked at Plaid after the commit."""
    return [item.access_token for item in await plaid_item_repo.list_for_user_all_orgs(db, user_id)]


async def revoke_access_tokens(access_tokens: list[str]) -> None:
    """Best effort: the person's data is already gone here; a failure is
    logged with Plaid's codes and the rest still run."""
    for access_token in access_tokens:
        await _remove_quietly(access_token, plaid_item_id=None)


async def _remove_quietly(access_token: str, *, plaid_item_id: str | None) -> None:
    try:
        await plaid_client.remove_item(access_token)
    except PlaidApiError as exc:
        if exc.error_code != PLAID_ERROR_ITEM_NOT_FOUND:
            logger.error(
                "Could not remove Plaid item %s: error_type=%s error_code=%s request_id=%s",
                plaid_item_id or "(deleted account)", exc.error_type, exc.error_code, exc.request_id,
            )
    except Exception:
        logger.exception("Could not remove Plaid item %s", plaid_item_id or "(deleted account)")


async def _get_owned(
    db: AsyncSession, item_id: uuid.UUID, *, user_id: uuid.UUID, organization_id: uuid.UUID,
) -> PlaidItem:
    item = await plaid_item_repo.get_for_user(
        db, item_id=item_id, user_id=user_id, organization_id=organization_id,
    )
    if item is None:
        raise PlaidItemNotFoundError(str(item_id))
    return item
