"""The Gmail address stored on a connection follows the account that's connected."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories import integration_repo

_EXPIRY = datetime(2026, 5, 13, 12, 0, 0, tzinfo=timezone.utc)


async def _connect(
    db: AsyncSession, org: Organization, user: User, refresh_token: str, address: str,
) -> Integration:
    integration = await integration_repo.upsert_gmail(
        db, org.id, user.id, "ya29.tok", refresh_token, _EXPIRY, gmail_address=address,
    )
    await db.flush()
    return integration


@pytest.mark.asyncio
async def test_connect_and_reconnect_store_the_account_address(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    first = await _connect(db, test_org, test_user, "rt-a", "a@gmail.com")
    assert first.gmail_address == "a@gmail.com"

    second = await _connect(db, test_org, test_user, "rt-b", "b@gmail.com")

    assert second.id == first.id
    await db.refresh(second)
    assert second.gmail_address == "b@gmail.com"


@pytest.mark.asyncio
async def test_address_is_encrypted_at_rest(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    integration = await _connect(db, test_org, test_user, "rt-a", "a@gmail.com")

    raw = (await db.execute(
        text("SELECT gmail_address FROM integrations WHERE id = :id"), {"id": integration.id.hex},
    )).scalar_one()

    assert raw and "a@gmail.com" not in raw


@pytest.mark.asyncio
async def test_looked_up_address_is_saved_on_the_same_connection(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    integration = await _connect(db, test_org, test_user, "rt-a", "a@gmail.com")
    integration.gmail_address = None
    await db.flush()

    saved = await integration_repo.set_gmail_address_if_unchanged(db, integration, "a@gmail.com")
    await db.flush()

    assert saved is True
    await db.refresh(integration)
    assert integration.gmail_address == "a@gmail.com"


@pytest.mark.asyncio
async def test_looked_up_address_is_not_saved_after_a_reconnect(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    integration = await _connect(db, test_org, test_user, "rt-a", "a@gmail.com")
    integration.gmail_address = None
    await db.flush()
    db.expunge(integration)
    reconnected = await _connect(db, test_org, test_user, "rt-b", "b@gmail.com")

    saved = await integration_repo.set_gmail_address_if_unchanged(db, integration, "a@gmail.com")
    await db.flush()

    assert saved is False
    await db.refresh(reconnected)
    assert reconnected.gmail_address == "b@gmail.com"
