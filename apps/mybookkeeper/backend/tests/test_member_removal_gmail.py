"""A member's Gmail connection goes once they can't connect one: removed, or made a viewer.

On real rows: removing or demoting to viewer the member who connected the org's
Gmail deletes that connection, and a connect that finishes after either saves
nothing.
"""
from __future__ import annotations

import logging
import re
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from platform_shared.core.auth_events import AuthEventType
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.gmail_connect_constants import GMAIL_CONNECT_NOT_ALLOWED_DETAIL
from app.models.organization.organization import Organization
from app.models.system.auth_event import AuthEvent
from app.models.user.user import User
from app.repositories import integration_repo, organization_repo
from app.services.integrations import integration_service
from app.services.integrations.gmail_connect_not_allowed_error import GmailConnectNotAllowedError
from app.services.organization import organization_service

_EXPIRY = datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc)


@pytest_asyncio.fixture()
async def member(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="removed-member@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _join(db: AsyncSession, org: Organization, user: User, role: str, invited_by: User) -> None:
    invite = await organization_repo.create_invite(db, org.id, user.email, role, invited_by.id)
    await organization_repo.accept_invite(db, invite, user.id)
    await db.flush()


async def _connect(db: AsyncSession, org: Organization, user: User) -> None:
    await integration_repo.upsert_gmail(
        db, org.id, user.id, "ya29.tok", "rt", _EXPIRY,
        scopes=["gmail.readonly"], gmail_address=user.email,
    )
    await db.flush()


async def _disconnect_events(db: AsyncSession) -> list[AuthEvent]:
    rows = (await db.execute(select(AuthEvent))).scalars().all()
    return [r for r in rows if r.event_type == AuthEventType.OAUTH_DISCONNECT]


@asynccontextmanager
async def _on(db: AsyncSession) -> AsyncIterator[AsyncSession]:
    yield db


@pytest.fixture
def same_session(db: AsyncSession) -> Iterator[None]:
    with (
        patch.object(organization_service, "unit_of_work", lambda: _on(db)),
        patch.object(integration_service, "unit_of_work", lambda: _on(db)),
    ):
        yield


@pytest.mark.asyncio
async def test_removing_the_member_who_connected_gmail_disconnects_it(
    db: AsyncSession, test_user: User, test_org: Organization, member: User, same_session,
) -> None:
    await _join(db, test_org, member, "admin", test_user)
    await _connect(db, test_org, member)

    await organization_service.remove_member(test_org.id, member.id, test_user.id)

    assert await integration_repo.list_by_org(db, test_org.id) == []
    [event] = await _disconnect_events(db)
    assert event.user_id == member.id
    assert event.event_metadata == {
        "provider": "gmail", "reason": "member_removed", "by": str(test_user.id),
    }


@pytest.mark.asyncio
async def test_removing_a_member_leaves_a_connection_someone_else_made(
    db: AsyncSession, test_user: User, test_org: Organization, member: User, same_session,
) -> None:
    await _join(db, test_org, member, "admin", test_user)
    await _connect(db, test_org, test_user)

    await organization_service.remove_member(test_org.id, member.id, test_user.id)

    [kept] = await integration_repo.list_by_org(db, test_org.id)
    assert kept.user_id == test_user.id
    assert await _disconnect_events(db) == []


@pytest.mark.asyncio
async def test_making_the_connecting_member_a_viewer_disconnects_it(
    db: AsyncSession, test_user: User, test_org: Organization, member: User, same_session,
) -> None:
    await _join(db, test_org, member, "admin", test_user)
    await _connect(db, test_org, member)

    await organization_service.update_member_role(test_org.id, member.id, "viewer", test_user.id)

    assert await integration_repo.list_by_org(db, test_org.id) == []
    [event] = await _disconnect_events(db)
    assert (event.user_id, event.event_metadata) == (
        member.id, {"provider": "gmail", "reason": "made_viewer", "by": str(test_user.id)},
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("connected_by", "new_role"),
    [("member", "user"), ("member", "admin"), ("owner", "viewer")],
    ids=["member-to-user", "member-to-admin", "someone-else-connected"],
)
async def test_other_role_changes_keep_the_connection(
    db: AsyncSession, test_user: User, test_org: Organization, member: User, same_session,
    connected_by, new_role,
) -> None:
    await _join(db, test_org, member, "user" if new_role == "admin" else "admin", test_user)
    connector = member if connected_by == "member" else test_user
    await _connect(db, test_org, connector)

    await organization_service.update_member_role(test_org.id, member.id, new_role, test_user.id)

    [kept] = await integration_repo.list_by_org(db, test_org.id)
    assert kept.user_id == connector.id
    assert await _disconnect_events(db) == []


@pytest.mark.asyncio
async def test_a_role_change_logs_the_role_it_replaced(
    db: AsyncSession, test_user: User, test_org: Organization, member: User, same_session,
    caplog: pytest.LogCaptureFixture,
) -> None:
    await _join(db, test_org, member, "admin", test_user)

    with caplog.at_level(logging.INFO, logger=organization_service.__name__):
        await organization_service.update_member_role(test_org.id, member.id, "user", test_user.id)

    assert any("old=admin new=user" in r.getMessage() for r in caplog.records)


@pytest.mark.asyncio
async def test_lock_member_finds_only_a_current_membership(
    db: AsyncSession, test_user: User, test_org: Organization, member: User,
) -> None:
    await _join(db, test_org, member, "viewer", test_user)

    locked = await organization_repo.lock_member(db, test_org.id, member.id)
    assert locked is not None and locked.org_role == "viewer"

    await organization_repo.remove_member(db, locked)

    assert await organization_repo.lock_member(db, test_org.id, member.id) is None


@pytest.fixture
def finish_connect(db: AsyncSession, same_session) -> Iterator[MagicMock]:
    """Run ``handle_gmail_callback`` to the save, with Google's side mocked."""
    creds = MagicMock(
        token="ya29.new",
        refresh_token="rt-new",
        expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        scopes={"https://www.googleapis.com/auth/gmail.readonly"},
    )
    state = MagicMock()
    with (
        patch.object(integration_service, "_get_flow", return_value=MagicMock(credentials=creds)),
        patch.object(integration_service, "_verify_oauth_state", state),
        patch.object(integration_service, "_require_state_outlives_session_cutoff", new=AsyncMock()),
        patch.object(
            integration_service.gmail_mailbox, "address_of_new_connection",
            new=AsyncMock(return_value="host@gmail.com"),
        ),
    ):
        yield state


def _started_by(state: MagicMock, org: Organization, user: User) -> None:
    state.return_value = (str(user.id), str(org.id), "verifier", 0)


@pytest.mark.asyncio
async def test_a_connect_finished_by_a_current_member_is_saved(
    db: AsyncSession, test_user: User, test_org: Organization, member: User, finish_connect,
) -> None:
    await _join(db, test_org, member, "admin", test_user)
    _started_by(finish_connect, test_org, member)

    await integration_service.handle_gmail_callback("code", "state")

    [saved] = await integration_repo.list_by_org(db, test_org.id)
    assert (saved.user_id, saved.gmail_address) == (member.id, "host@gmail.com")


@pytest.mark.asyncio
@pytest.mark.parametrize("now", ["removed", "viewer"])
async def test_a_connect_finished_after_losing_access_saves_nothing(
    db: AsyncSession, test_user: User, test_org: Organization, member: User, finish_connect, now,
) -> None:
    await _join(db, test_org, member, "admin", test_user)
    _started_by(finish_connect, test_org, member)
    membership = await organization_repo.get_member(db, test_org.id, member.id)
    assert membership is not None
    if now == "removed":
        await organization_repo.remove_member(db, membership)
    else:
        membership.org_role = "viewer"
        await db.flush()

    with pytest.raises(GmailConnectNotAllowedError, match=re.escape(GMAIL_CONNECT_NOT_ALLOWED_DETAIL)):
        await integration_service.handle_gmail_callback("code", "state")

    assert await integration_repo.list_by_org(db, test_org.id) == []
