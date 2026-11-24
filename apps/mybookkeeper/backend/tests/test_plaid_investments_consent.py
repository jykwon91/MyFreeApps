"""Asking a bank connection for investment holdings (real SQLite session,
Plaid mocked at ``plaid_item_service.plaid_client``).

Pinned here: a new bank is asked consent for investments as an additional
consented product; when this Plaid account isn't enabled for Investments
(INVALID_PRODUCT) the token is asked again without it so bank-only linking
never breaks, while any other refusal still raises; "Add investments" opens
update mode on the person's own connection with the consent and no
products; and finishing update mode clears the old holdings refusal so the
next sync asks again.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integrations.plaid_item import PlaidItem
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.schemas.plaid.wire.plaid_wire_link_token_response import PlaidWireLinkTokenResponse
from app.services.plaid import plaid_item_service as svc
from app.services.plaid.plaid_api_error import PlaidApiError
from app.services.plaid.plaid_item_not_found_error import PlaidItemNotFoundError

pytestmark = pytest.mark.asyncio

_CREATE = "app.services.plaid.plaid_item_service.plaid_client.create_link_token"
_TOKEN = PlaidWireLinkTokenResponse(
    link_token="link-1", expiration=_dt.datetime(2026, 11, 24, tzinfo=_dt.timezone.utc),
)


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(svc, "unit_of_work", _uow):
        yield


def _refusal(error_code: str) -> PlaidApiError:
    return PlaidApiError(
        endpoint="/link/token/create", status_code=400, error_type="INVALID_INPUT",
        error_code=error_code, request_id="req-1",
    )


async def _item(db: AsyncSession, org: Organization, user: User) -> PlaidItem:
    item = PlaidItem(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        plaid_item_id=f"item-{uuid.uuid4()}", institution_name="Fidelity",
        investments_status="consent_required", investments_error_code="ADDITIONAL_CONSENT_REQUIRED",
    )
    item.access_token = "access-1"
    db.add(item)
    await db.commit()
    return item


async def test_a_new_bank_is_asked_consent_for_investments(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    create = AsyncMock(return_value=_TOKEN)
    with _session(db), patch(_CREATE, create):
        token = await svc.create_link_token(user_id=test_user.id, organization_id=test_org.id, item_id=None)
    assert token.link_token == "link-1"
    create.assert_awaited_once_with(
        client_user_id=str(test_user.id), additional_consented_products=("investments",),
    )


async def test_without_investments_enabled_a_bank_still_connects(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    create = AsyncMock(side_effect=[_refusal("INVALID_PRODUCT"), _TOKEN])
    with _session(db), patch(_CREATE, create):
        token = await svc.create_link_token(user_id=test_user.id, organization_id=test_org.id, item_id=None)
    assert token.link_token == "link-1"
    assert create.await_args_list[1].kwargs == {"client_user_id": str(test_user.id)}


async def test_any_other_refusal_still_raises(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    create = AsyncMock(side_effect=_refusal("INVALID_FIELD"))
    with _session(db), patch(_CREATE, create), pytest.raises(PlaidApiError):
        await svc.create_link_token(user_id=test_user.id, organization_id=test_org.id, item_id=None)
    assert create.await_count == 1


async def test_add_investments_opens_update_mode_with_the_consent(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    create = AsyncMock(return_value=_TOKEN)
    with _session(db), patch(_CREATE, create):
        await svc.create_link_token(
            user_id=test_user.id, organization_id=test_org.id, item_id=item.id, add_investments=True,
        )
    create.assert_awaited_once_with(
        client_user_id=str(test_user.id), access_token="access-1",
        additional_consented_products=("investments",),
    )


async def test_a_plain_reconnect_asks_no_new_consent(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    create = AsyncMock(return_value=_TOKEN)
    with _session(db), patch(_CREATE, create):
        await svc.create_link_token(user_id=test_user.id, organization_id=test_org.id, item_id=item.id)
    assert create.await_args.kwargs["additional_consented_products"] == ()


async def test_someone_elses_connection_cannot_gain_consent(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    with _session(db), patch(_CREATE, AsyncMock()), pytest.raises(PlaidItemNotFoundError):
        await svc.create_link_token(
            user_id=uuid.uuid4(), organization_id=test_org.id, item_id=item.id, add_investments=True,
        )


async def test_finishing_update_mode_clears_the_holdings_refusal(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    with _session(db):
        response = await svc.mark_reconnected(
            item_id=item.id, user_id=test_user.id, organization_id=test_org.id,
        )
    await db.refresh(item)
    assert (item.investments_status, item.investments_error_code) == (None, None)
    assert response.investments_status is None
