"""An org has one Gmail connection, whichever member connected it, and it syncs as that org.

On real rows: the unique key is (organization_id, provider), so a member of two
orgs can connect Gmail in each, and a second connect in one org takes over its row.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.integrations.gmail_sync_target import GmailSyncTarget
from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories import integration_repo, organization_repo
from app.repositories.integrations import integration_repo as integration_repo_module
from app.workers.email_sync_worker import sync_gmail_connection

_EXPIRY = datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc)


@dataclass(frozen=True)
class _DiscoverResult:
    sync_log_id: int | None


async def _connect(
    db: AsyncSession, org: Organization, user: User, refresh_token: str, address: str,
) -> Integration:
    integration = await integration_repo.upsert_gmail(
        db, org.id, user.id, "ya29.tok", refresh_token, _EXPIRY,
        scopes=["gmail.readonly"], gmail_address=address,
    )
    await db.flush()
    return integration


async def _add_member(db: AsyncSession, org: Organization, user: User, invited_by: User) -> None:
    invite = await organization_repo.create_invite(db, org.id, user.email, "admin", invited_by.id)
    await organization_repo.accept_invite(db, invite, user.id)


@pytest_asyncio.fixture()
async def other_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="second-member@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture()
async def other_org(db: AsyncSession, other_user: User) -> Organization:
    return await organization_repo.create(db, "Second Org", other_user.id)


@pytest.mark.asyncio
async def test_another_member_reconnecting_takes_over_the_orgs_row(
    db: AsyncSession, test_user: User, test_org: Organization, other_user: User,
) -> None:
    await _add_member(db, test_org, other_user, test_user)
    first = await _connect(db, test_org, test_user, "rt-a", "a@gmail.com")

    second = await _connect(db, test_org, other_user, "rt-b", "b@gmail.com")

    assert second.id == first.id
    rows = await integration_repo.list_by_org(db, test_org.id)
    assert [(r.user_id, r.refresh_token, r.gmail_address) for r in rows] == [
        (other_user.id, "rt-b", "b@gmail.com"),
    ]


@pytest.mark.asyncio
async def test_a_member_of_two_orgs_can_connect_gmail_in_each(
    db: AsyncSession, test_user: User, test_org: Organization,
    other_user: User, other_org: Organization,
) -> None:
    await _add_member(db, other_org, test_user, other_user)

    in_first = await _connect(db, test_org, test_user, "rt-a", "a@gmail.com")
    in_second = await _connect(db, other_org, test_user, "rt-b", "b@gmail.com")

    assert in_first.id != in_second.id
    first = await integration_repo.get_by_org_and_provider(db, test_org.id, "gmail")
    second = await integration_repo.get_by_org_and_provider(db, other_org.id, "gmail")
    assert first is not None and first.gmail_address == "a@gmail.com"
    assert second is not None and second.gmail_address == "b@gmail.com"


@pytest.mark.asyncio
async def test_a_connect_that_loses_the_race_for_the_first_row_takes_it_over(
    db: AsyncSession, test_user: User, test_org: Organization, other_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two first connects at once: the second insert hits the key and updates the winner's row."""
    await _add_member(db, test_org, other_user, test_user)
    winner = await _connect(db, test_org, test_user, "rt-a", "a@gmail.com")
    real_lock = integration_repo_module._lock_org_gmail
    lookups: list[uuid.UUID] = []

    async def lock_that_ran_before_the_winner_committed(
        session: AsyncSession, organization_id: uuid.UUID,
    ) -> Integration | None:
        lookups.append(organization_id)
        if len(lookups) == 1:
            return None
        return await real_lock(session, organization_id)

    monkeypatch.setattr(integration_repo_module, "_lock_org_gmail", lock_that_ran_before_the_winner_committed)

    loser = await _connect(db, test_org, other_user, "rt-b", "b@gmail.com")

    assert len(lookups) == 2
    assert loser.id == winner.id
    rows = await integration_repo.list_by_org(db, test_org.id)
    assert [(r.user_id, r.refresh_token, r.gmail_address, r.metadata_) for r in rows] == [
        (other_user.id, "rt-b", "b@gmail.com", {"scopes": ["gmail.readonly"]}),
    ]


@pytest.mark.asyncio
async def test_sync_targets_are_each_orgs_connection_except_those_awaiting_a_reconnect(
    db: AsyncSession, test_user: User, test_org: Organization,
    other_user: User, other_org: Organization,
) -> None:
    await _add_member(db, other_org, test_user, other_user)
    await _connect(db, test_org, test_user, "rt-a", "a@gmail.com")
    expired = await _connect(db, other_org, test_user, "rt-b", "b@gmail.com")

    assert set(await integration_repo.list_active_gmail_sync_targets(db)) == {
        GmailSyncTarget(organization_id=test_org.id, user_id=test_user.id),
        GmailSyncTarget(organization_id=other_org.id, user_id=test_user.id),
    }

    expired.needs_reauth = True
    await db.flush()

    assert await integration_repo.list_active_gmail_sync_targets(db) == [
        GmailSyncTarget(organization_id=test_org.id, user_id=test_user.id),
    ]


@asynccontextmanager
async def _session_on(db: AsyncSession) -> AsyncIterator[AsyncSession]:
    yield db


async def _run_sync(db: AsyncSession, target: GmailSyncTarget) -> list[RequestContext]:
    discovered: list[RequestContext] = []

    async def discover(ctx: RequestContext) -> _DiscoverResult:
        discovered.append(ctx)
        return _DiscoverResult(sync_log_id=None)

    with (
        patch("app.workers.email_sync_worker.AsyncSessionLocal", lambda: _session_on(db)),
        patch("app.workers.email_sync_worker.discover_gmail_emails", side_effect=discover),
        patch("app.workers.email_sync_worker.drain_gmail_fetch", new_callable=AsyncMock),
        patch("app.workers.email_sync_worker.drain_claude_extraction", new_callable=AsyncMock),
    ):
        await sync_gmail_connection(target)
    return discovered


@pytest.mark.asyncio
async def test_sync_runs_in_the_org_that_owns_the_connection_not_the_users_first_org(
    db: AsyncSession, test_user: User, test_org: Organization,
    other_user: User, other_org: Organization,
) -> None:
    await _add_member(db, other_org, test_user, other_user)
    await _connect(db, other_org, test_user, "rt-b", "b@gmail.com")

    discovered = await _run_sync(db, GmailSyncTarget(organization_id=other_org.id, user_id=test_user.id))

    assert [(c.organization_id, c.user_id) for c in discovered] == [(other_org.id, test_user.id)]


@pytest.mark.asyncio
async def test_sync_is_skipped_when_the_member_who_connected_it_has_left(
    db: AsyncSession, test_user: User, other_user: User, other_org: Organization,
) -> None:
    await _connect(db, other_org, test_user, "rt-b", "b@gmail.com")

    discovered = await _run_sync(db, GmailSyncTarget(organization_id=other_org.id, user_id=test_user.id))

    assert discovered == []
