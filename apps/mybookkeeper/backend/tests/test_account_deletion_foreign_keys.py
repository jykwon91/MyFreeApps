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
from app.db.session import get_db
from app.main import app as fastapi_app
from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.properties.property import Property
from app.models.inquiries.reply_template import ReplyTemplate
from app.models.user.user import User
from app.repositories.user import account_files_repo
from app.services.user.account_deletion_service import remove_stored_files
from platform_shared.testing.account_deletion_schema import (
    entries_without_reason,
    foreign_keys_blocking_user_deletion,
    missing_columns,
    stored_file_suspects,
)

# Foreign keys that can block deleting a user (RESTRICT, or no cascade from outside the
# delete), each with how the delete gets past it. A new one needs the same look: run the
# delete against migrated Postgres, then add it here.
HELD_BY_ANOTHER_WORKSPACE = (
    "Workspaces the user owns are deleted first; any row left belongs to another workspace "
    "and holds_shared_records refuses the delete"
)
KNOWN_BLOCKING_FOREIGN_KEYS: dict[str, str] = {
    "insurance_policy_attachments.uploaded_by_user_id": HELD_BY_ANOTHER_WORKSPACE,
    "lease_term_versions.created_by_user_id": HELD_BY_ANOTHER_WORKSPACE,
    "listing_blackout_attachments.uploaded_by_user_id": HELD_BY_ANOTHER_WORKSPACE,
    "screening_results.uploaded_by_user_id": HELD_BY_ANOTHER_WORKSPACE,
    "signed_lease_attachments.uploaded_by_user_id": HELD_BY_ANOTHER_WORKSPACE,
    "organizations.created_by": "prepare_deletion deletes the user's workspaces before the user",
    "signed_leases.applicant_id": (
        "prepare_deletion hard-deletes the workspace's signed leases before the workspace"
    ),
    "signed_lease_templates.template_id": (
        "Removed with its signed lease when prepare_deletion hard-deletes the workspace's "
        "signed leases"
    ),
}

# Look like stored-file references but are not (storage keys are covered by the cleanup).
NOT_STORED_FILE_COLUMNS: dict[str, str] = {
    "channel_listings.external_url": "Link to the listing on another site",
    "channel_listings.ical_import_url": "External calendar feed address",
    "email_queue.attachment_filename": "Display name of an attachment, not a stored key",
    "insurance_policy_attachments.filename": "Original upload name; the stored key is storage_key",
    "lease_template_files.filename": "Original upload name; the stored key is storage_key",
    "lease_template_placeholders.key": "Placeholder name inside a template, not a file",
    "listing_blackout_attachments.filename": "Original upload name; the stored key is storage_key",
    "listing_external_ids.external_url": "Link to the listing on another site",
    "signed_lease_attachments.filename": "Original upload name; the stored key is storage_key",
    "tax_advisor_suggestions.suggestion_key": "Identifier of a suggestion type, not a file",
    "welcome_manual_places.map_url": "Link to a map page, not a stored file",
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


async def _file_in(db: AsyncSession, org: Organization, writer: User, key: str) -> None:
    db.add(Document(organization_id=org.id, user_id=writer.id, file_storage_key=key))
    await db.flush()


async def _delete_account(db: AsyncSession, user: User) -> Response:
    fastapi_app.dependency_overrides[current_active_user] = lambda: user
    fastapi_app.dependency_overrides[get_db] = lambda: db
    try:
        with patch("platform_shared.testing.factories._FastPasswordHelper") as helper:
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

    response = await _delete_account(db, owner)

    assert response.status_code == 204
    assert not await _exists(db, User, owner.id)
    assert not await _exists(db, Organization, org.id)


@pytest.mark.asyncio
async def test_creator_of_a_shared_workspace_is_refused_and_nothing_changes(db: AsyncSession) -> None:
    owner, member = await _users(db, "owner@example.com", "member@example.com")
    solo = await _workspace(db, owner)
    shared = await _workspace(db, owner, member)

    response = await _delete_account(db, owner)

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

    response = await _delete_account(db, member)

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

    response = await _delete_account(db, member)

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_member_who_wrote_records_is_refused_and_keeps_their_own_workspace(db: AsyncSession) -> None:
    owner, member = await _users(db, "owner@example.com", "member@example.com")
    shared = await _workspace(db, owner, member)
    own = await _workspace(db, member)
    await _record_in(db, shared, member)

    response = await _delete_account(db, member)

    assert response.status_code == 409
    assert response.json()["detail"] == HOLDS_SHARED_RECORDS_MESSAGE
    assert await _exists(db, User, member.id)
    assert await _exists(db, Organization, own.id)


@pytest.mark.asyncio
async def test_being_removed_from_a_workspace_does_not_take_their_records_out_of_it(db: AsyncSession) -> None:
    owner, former = await _users(db, "owner@example.com", "former@example.com")
    org = await _workspace(db, owner)
    await _record_in(db, org, former)

    response = await _delete_account(db, former)

    assert response.status_code == 409
    assert response.json()["detail"] == HOLDS_SHARED_RECORDS_MESSAGE
    assert await _exists(db, User, former.id)


@pytest.mark.asyncio
async def test_deleting_an_account_removes_its_stored_files_and_nobody_elses(db: AsyncSession) -> None:
    owner, other = await _users(db, "owner@example.com", "other@example.com")
    org = await _workspace(db, owner)
    elsewhere = await _workspace(db, other)
    await _file_in(db, org, owner, "mine.pdf")
    await _file_in(db, elsewhere, other, "theirs.pdf")

    # Foreign keys are off here, so the workspace's rows outlive it and would look shared.
    with (
        patch("app.services.user.account_deletion_service.get_storage") as get_storage,
        patch("app.services.user.account_deletion_service.user_repo.holds_shared_records", return_value=False),
    ):
        response = await _delete_account(db, owner)

    assert response.status_code == 204
    get_storage.return_value.delete_file.assert_called_once_with("mine.pdf")


@pytest.mark.asyncio
async def test_a_refused_delete_leaves_stored_files_alone(db: AsyncSession) -> None:
    owner, member = await _users(db, "owner@example.com", "member@example.com")
    shared = await _workspace(db, owner, member)
    own = await _workspace(db, member)
    await _record_in(db, shared, member)
    await _file_in(db, own, member, "mine.pdf")

    with patch("app.services.user.account_deletion_service.get_storage") as get_storage:
        response = await _delete_account(db, member)

    assert response.status_code == 409
    get_storage.return_value.delete_file.assert_not_called()


def test_one_stored_file_failing_does_not_stop_the_rest() -> None:
    with patch("app.services.user.account_deletion_service.get_storage") as get_storage:
        get_storage.return_value.delete_file.side_effect = [ConnectionError("down"), None]
        remove_stored_files(["a.pdf", "b.pdf"])

    assert get_storage.return_value.delete_file.call_count == 2


def test_unreachable_storage_logs_every_key_left_behind(caplog: pytest.LogCaptureFixture) -> None:
    with patch("app.services.user.account_deletion_service.get_storage", side_effect=RuntimeError("no storage")):
        remove_stored_files(["a.pdf", "b.pdf"])

    assert "key=a.pdf" in caplog.text
    assert "key=b.pdf" in caplog.text


def _columns_covered_by_the_cleanup() -> set[str]:
    return {
        f"{column['expr'].table.name}.{column['expr'].name}"
        for query in account_files_repo._queries([uuid.uuid4()])
        for column in query.column_descriptions
    }


def test_every_stored_file_column_is_covered_by_the_cleanup() -> None:
    covered = _columns_covered_by_the_cleanup()
    assert missing_columns(Base.metadata, covered) == []
    suspects = stored_file_suspects(Base.metadata, excused=covered | set(NOT_STORED_FILE_COLUMNS))
    assert suspects == [], (
        f"These columns look like stored-file references: {suspects}. If one IS a stored "
        "file, add it to account_files_repo so account deletion removes the file. If not, "
        "add table.column to NOT_STORED_FILE_COLUMNS with a reason."
    )


def test_every_excused_stored_file_column_exists_and_has_a_reason() -> None:
    assert missing_columns(Base.metadata, NOT_STORED_FILE_COLUMNS) == []
    assert entries_without_reason(NOT_STORED_FILE_COLUMNS) == []


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
    blocking = set(foreign_keys_blocking_user_deletion(Base.metadata, User.__table__.name))
    assert blocking == set(KNOWN_BLOCKING_FOREIGN_KEYS)
    assert entries_without_reason(KNOWN_BLOCKING_FOREIGN_KEYS) == []
