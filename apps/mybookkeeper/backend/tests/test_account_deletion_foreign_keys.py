"""Who can delete their account, given what it would cost other people.

The shared ``db`` fixture runs with foreign keys off, so these tests can't see
a cascade or a RESTRICT. The schema tests at the bottom hold the rules those
would break, and the full delete was run by hand against migrated Postgres.
"""
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.models  # noqa: F401
from app.core.account_deletion_constants import (
    HOLDS_SHARED_RECORDS_MESSAGE,
    OWNS_SHARED_WORKSPACE_MESSAGE,
    TABLES_NOT_HOLDING_SHARED_RECORDS,
)
from app.core.auth import current_active_user
from app.db.base import Base
from app.main import app as fastapi_app
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.properties.property import Property
from app.models.inquiries.reply_template import ReplyTemplate
from app.models.user.user import User

# Each is checked by Postgres the moment a row goes, so deleting a workspace or
# a user has to clear these first. A new one needs the same look: run the delete
# against migrated Postgres, then add it here.
KNOWN_RESTRICTING_FOREIGN_KEYS = {
    "channel_listings.channel_id",
    "insurance_policy_attachments.uploaded_by_user_id",
    "lease_term_versions.created_by_user_id",
    "listing_blackout_attachments.uploaded_by_user_id",
    "organizations.created_by",
    "screening_results.uploaded_by_user_id",
    "signed_lease_attachments.uploaded_by_user_id",
    "signed_lease_templates.template_id",
    "signed_leases.applicant_id",
}


@pytest_asyncio.fixture(autouse=True)
async def _transactional_unit_of_work(db: AsyncSession) -> AsyncGenerator[None, None]:
    """A refusal has to undo what ran before it, as the real unit of work does."""

    @asynccontextmanager
    async def _uow():
        async with db.begin_nested():
            yield db

    with patch("app.api.account.unit_of_work", _uow):
        yield


def _a_user(email: str) -> User:
    return User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="hash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        totp_enabled=False,
    )


async def _users(db: AsyncSession, *emails: str) -> list[User]:
    users = [_a_user(email) for email in emails]
    db.add_all(users)
    await db.flush()
    return users


async def _workspace(db: AsyncSession, creator: User, *members: User) -> Organization:
    org = Organization(id=uuid.uuid4(), name=f"{creator.email} workspace", created_by=creator.id)
    db.add(org)
    await db.flush()
    db.add(OrganizationMember(organization_id=org.id, user_id=creator.id, org_role="owner"))
    for member in members:
        db.add(OrganizationMember(organization_id=org.id, user_id=member.id, org_role="admin"))
    await db.flush()
    return org


async def _record_in(db: AsyncSession, org: Organization, writer: User) -> None:
    db.add(Property(id=uuid.uuid4(), organization_id=org.id, user_id=writer.id, name="Elm St"))
    await db.flush()


async def _delete_account(user: User) -> Response:
    fastapi_app.dependency_overrides[current_active_user] = lambda: user
    try:
        with patch("platform_shared.api.account_deletion_router.PasswordHelper") as helper:
            helper.return_value.verify_and_update.return_value = (True, None)
            async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as client:
                return await client.request("DELETE", "/users/me", json={"password": "pw", "confirm_email": user.email})
    finally:
        fastapi_app.dependency_overrides.clear()


async def _exists(db: AsyncSession, model: type, row_id: uuid.UUID) -> bool:
    found = await db.execute(select(model.id).where(model.id == row_id))
    return found.first() is not None


@pytest.mark.asyncio
async def test_sole_owner_can_delete_and_their_workspace_goes_too(db: AsyncSession) -> None:
    [owner] = await _users(db, "owner@example.com")
    org = await _workspace(db, owner)

    response = await _delete_account(owner)

    assert response.status_code == 204
    assert not await _exists(db, User, owner.id)
    assert not await _exists(db, Organization, org.id)


@pytest.mark.asyncio
async def test_creator_of_a_shared_workspace_is_refused_and_nothing_changes(db: AsyncSession) -> None:
    owner, member = await _users(db, "owner@example.com", "member@example.com")
    solo = await _workspace(db, owner)
    shared = await _workspace(db, owner, member)

    response = await _delete_account(owner)

    assert response.status_code == 409
    assert response.json()["detail"] == OWNS_SHARED_WORKSPACE_MESSAGE
    assert await _exists(db, User, owner.id)
    assert await _exists(db, Organization, solo.id)
    assert await _exists(db, Organization, shared.id)


@pytest.mark.asyncio
async def test_member_who_wrote_nothing_can_leave_and_the_workspace_survives(db: AsyncSession) -> None:
    owner, member = await _users(db, "owner@example.com", "member@example.com")
    org = await _workspace(db, owner, member)
    await _record_in(db, org, owner)

    response = await _delete_account(member)

    assert response.status_code == 204
    assert not await _exists(db, User, member.id)
    assert await _exists(db, User, owner.id)
    assert await _exists(db, Organization, org.id)


@pytest.mark.asyncio
async def test_opening_the_reply_picker_in_a_shared_workspace_does_not_block_leaving(db: AsyncSession) -> None:
    owner, member = await _users(db, "owner@example.com", "member@example.com")
    org = await _workspace(db, owner, member)
    db.add(ReplyTemplate(
        organization_id=org.id,
        user_id=member.id,
        name="Seeded on first open",
        subject_template="Hi",
        body_template="Hello",
    ))
    await db.flush()

    response = await _delete_account(member)

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_member_who_wrote_records_is_refused_and_keeps_their_own_workspace(db: AsyncSession) -> None:
    owner, member = await _users(db, "owner@example.com", "member@example.com")
    shared = await _workspace(db, owner, member)
    own = await _workspace(db, member)
    await _record_in(db, shared, member)

    response = await _delete_account(member)

    assert response.status_code == 409
    assert response.json()["detail"] == HOLDS_SHARED_RECORDS_MESSAGE
    assert await _exists(db, User, member.id)
    assert await _exists(db, Organization, own.id)


@pytest.mark.asyncio
async def test_being_removed_from_a_workspace_does_not_take_their_records_out_of_it(db: AsyncSession) -> None:
    owner, former = await _users(db, "owner@example.com", "former@example.com")
    org = await _workspace(db, owner)
    await _record_in(db, org, former)

    response = await _delete_account(former)

    assert response.status_code == 409
    assert response.json()["detail"] == HOLDS_SHARED_RECORDS_MESSAGE
    assert await _exists(db, User, former.id)


def test_every_table_is_loaded_with_the_models_package() -> None:
    """The shared records check reads the schema, so it can't see an unloaded model."""
    models_dir = Path(app.models.__file__).parent
    loaded = (models_dir / "__init__.py").read_text()
    defining_a_table = [
        ".".join(path.relative_to(models_dir).with_suffix("").parts)
        for path in models_dir.rglob("*.py")
        if "__tablename__" in path.read_text()
    ]
    assert [module for module in defining_a_table if f"app.models.{module} " not in loaded] == []


def test_every_table_excused_from_the_shared_records_check_exists() -> None:
    assert TABLES_NOT_HOLDING_SHARED_RECORDS <= set(Base.metadata.tables)


def test_foreign_keys_that_block_a_delete_have_all_been_checked() -> None:
    restricting = {
        f"{table.name}.{fk.parent.name}"
        for table in Base.metadata.sorted_tables
        for fk in table.foreign_keys
        if fk.ondelete in (None, "RESTRICT", "NO ACTION") and _blocks_a_delete(fk)
    }
    assert restricting == KNOWN_RESTRICTING_FOREIGN_KEYS


def _blocks_a_delete(fk) -> bool:  # type: ignore[no-untyped-def]
    """Only rows a user's account reaches matter, not global reference tables."""
    return fk.ondelete == "RESTRICT" or fk.column.table.name == "users"
