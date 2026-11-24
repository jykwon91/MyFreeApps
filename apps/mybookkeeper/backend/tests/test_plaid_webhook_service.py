"""What a verified Plaid webhook does to a connection (real SQLite session).

Pinned here: SYNC_UPDATES_AVAILABLE asks for a sync of the right item; item
error / pending-expiration webhooks flag the item for reconnect;
LOGIN_REPAIRED clears it; HOLDINGS DEFAULT_UPDATE asks for a holdings-only
refresh; an unknown item, an unrelated code and a body
without a type are ignored.
"""
from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from typing import Any
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integrations.plaid_item import PlaidItem
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.schemas.plaid.plaid_webhook_follow_up import PlaidWebhookFollowUp
from app.services.plaid import plaid_webhook_service as svc

pytestmark = pytest.mark.asyncio


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(svc, "unit_of_work", _uow):
        yield


async def _item(db: AsyncSession, org: Organization, user: User, **fields: Any) -> PlaidItem:
    item = PlaidItem(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        plaid_item_id=f"item-{uuid.uuid4()}", **fields,
    )
    item.access_token = "access-1"
    db.add(item)
    await db.commit()
    return item


async def _handle(db: AsyncSession, **body: Any) -> PlaidWebhookFollowUp | None:
    with _session(db):
        return await svc.handle(json.dumps(body).encode())


async def test_sync_updates_available_asks_for_a_sync_of_that_item(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    result = await _handle(
        db, webhook_type="TRANSACTIONS", webhook_code="SYNC_UPDATES_AVAILABLE", item_id=item.plaid_item_id,
    )
    assert result == PlaidWebhookFollowUp(item_id=item.id)


async def test_an_item_login_required_error_flags_it_for_reconnect(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    result = await _handle(
        db, webhook_type="ITEM", webhook_code="ERROR", item_id=item.plaid_item_id,
        error={"error_type": "ITEM_ERROR", "error_code": "ITEM_LOGIN_REQUIRED"},
    )
    assert result is None
    await db.refresh(item)
    assert (item.status, item.error_code) == ("login_required", "ITEM_LOGIN_REQUIRED")


async def test_pending_expiration_flags_it_for_reconnect(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    await _handle(db, webhook_type="ITEM", webhook_code="PENDING_EXPIRATION", item_id=item.plaid_item_id)
    await db.refresh(item)
    assert item.status == "login_required"


async def test_login_repaired_clears_the_flag(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(
        db, test_org, test_user, status="login_required",
        error_type="ITEM_ERROR", error_code="ITEM_LOGIN_REQUIRED",
    )
    await _handle(db, webhook_type="ITEM", webhook_code="LOGIN_REPAIRED", item_id=item.plaid_item_id)
    await db.refresh(item)
    assert (item.status, item.error_type, item.error_code) == ("active", None, None)


async def test_an_unrelated_transactions_code_does_nothing(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    assert await _handle(
        db, webhook_type="TRANSACTIONS", webhook_code="DEFAULT_UPDATE", item_id=item.plaid_item_id,
    ) is None


async def test_an_item_not_on_file_is_ignored(db: AsyncSession) -> None:
    assert await _handle(
        db, webhook_type="TRANSACTIONS", webhook_code="SYNC_UPDATES_AVAILABLE", item_id="someone-else",
    ) is None


async def test_a_body_without_a_type_is_ignored(db: AsyncSession) -> None:
    assert await _handle(db, hello="world") is None


async def test_holdings_default_update_asks_for_a_holdings_refresh_only(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    result = await _handle(
        db, webhook_type="HOLDINGS", webhook_code="DEFAULT_UPDATE", item_id=item.plaid_item_id,
        new_holdings=1, updated_holdings=2,
    )
    assert result == PlaidWebhookFollowUp(item_id=item.id, holdings_only=True)


async def test_an_unknown_holdings_code_is_ignored(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    assert await _handle(
        db, webhook_type="HOLDINGS", webhook_code="SOMETHING_NEW", item_id=item.plaid_item_id,
    ) is None
