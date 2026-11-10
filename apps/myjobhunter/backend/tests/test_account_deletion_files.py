"""DELETE /users/me removes the user's stored files, and only after the commit.

Covers:
- Every stored-file column (documents, profile resume, resume upload jobs) is deleted
- Another user's files are left alone
- A storage failure never blocks the deletion and is logged by key
- A failed deletion removes no files
"""
import contextlib
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.application.document import Document
from app.models.jobs.resume_upload_job import ResumeUploadJob
from app.models.profile.profile import Profile
from app.models.user.user import User
from app.repositories.user import account_files_repo
from platform_shared.testing.account_deletion_schema import (
    entries_without_reason,
    foreign_keys_blocking_user_deletion,
    missing_columns,
    stored_file_suspects,
)


def _make_user() -> User:
    return User(
        id=uuid.uuid4(),
        email=f"files-{uuid.uuid4().hex[:10]}@example.com",
        hashed_password="$2b$12$fakehashfortestingonly1234",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        totp_enabled=False,
        display_name="Files",
    )


async def _user_with_files(db: AsyncSession, tag: str) -> tuple[User, set[str]]:
    user = _make_user()
    db.add(user)
    await db.flush()
    profile = Profile(user_id=user.id, resume_file_path=f"{tag}/profile-resume.pdf")
    db.add(profile)
    await db.flush()
    db.add(ResumeUploadJob(user_id=user.id, profile_id=profile.id, file_path=f"{tag}/upload-job.pdf"))
    db.add(Document(user_id=user.id, title="Letter", kind="cover_letter", file_path=f"{tag}/letter.pdf"))
    db.add(Document(user_id=user.id, title="Note", kind="other", body="no file"))
    await db.flush()
    return user, {f"{tag}/profile-resume.pdf", f"{tag}/upload-job.pdf", f"{tag}/letter.pdf"}


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _fake_uow() -> AsyncIterator[AsyncSession]:
        yield db
        await db.flush()

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.api.account.unit_of_work", _fake_uow):
        yield
    app.dependency_overrides.clear()


@pytest.fixture
def storage() -> Iterator[MagicMock]:
    with patch("app.services.user.account_deletion_service.get_storage") as get_storage:
        yield get_storage.return_value


@contextlib.asynccontextmanager
async def _delete_as(user: User) -> AsyncIterator[AsyncClient]:
    app.dependency_overrides[current_active_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def _delete_account(user: User):
    with patch("platform_shared.testing.factories._FastPasswordHelper") as helper_cls:
        helper_cls.return_value.verify_and_update.return_value = (True, None)
        async with _delete_as(user) as client:
            return await client.request(
                "DELETE", "/users/me", json={"password": "pw", "confirm_email": user.email},
            )


async def _user_exists(db: AsyncSession, user_id: uuid.UUID) -> bool:
    row = await db.execute(
        select(User.id).where(User.id == user_id).execution_options(populate_existing=True)
    )
    return row.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_list_storage_keys_covers_every_file_column_and_only_this_user(db: AsyncSession) -> None:
    user, keys = await _user_with_files(db, "a")
    await _user_with_files(db, "b")

    assert await account_files_repo.list_storage_keys(db, user.id) == sorted(keys)


@pytest.mark.asyncio
async def test_deleting_an_account_removes_its_files_and_nobody_elses(
    db: AsyncSession, storage: MagicMock,
) -> None:
    user, keys = await _user_with_files(db, "mine")
    other, other_keys = await _user_with_files(db, "theirs")

    response = await _delete_account(user)

    assert response.status_code == 204
    assert not await _user_exists(db, user.id)
    assert await _user_exists(db, other.id)
    deleted = {call.args[0] for call in storage.delete_file.call_args_list}
    assert deleted == keys
    assert deleted.isdisjoint(other_keys)


@pytest.mark.asyncio
async def test_a_file_shared_by_two_rows_is_deleted_once(db: AsyncSession, storage: MagicMock) -> None:
    user, _ = await _user_with_files(db, "dup")
    db.add(Document(user_id=user.id, title="Same", kind="other", file_path="dup/letter.pdf"))
    await db.flush()

    await _delete_account(user)

    keys = [call.args[0] for call in storage.delete_file.call_args_list]
    assert sorted(keys) == sorted(set(keys))


@pytest.mark.asyncio
async def test_a_storage_failure_still_deletes_the_account_and_logs_the_key(
    db: AsyncSession, storage: MagicMock, caplog: pytest.LogCaptureFixture,
) -> None:
    user, keys = await _user_with_files(db, "flaky")
    storage.delete_file.side_effect = ConnectionError("storage down")

    response = await _delete_account(user)

    assert response.status_code == 204
    assert not await _user_exists(db, user.id)
    assert storage.delete_file.call_count == len(keys)
    for key in keys:
        assert f"key={key}" in caplog.text


@pytest.mark.asyncio
async def test_a_failed_deletion_removes_no_files(db: AsyncSession, storage: MagicMock) -> None:
    user, _ = await _user_with_files(db, "kept")

    with patch(
        "platform_shared.api.account_deletion_router.delete_account",
        side_effect=RuntimeError("db failure"),
    ):
        with pytest.raises(RuntimeError, match="db failure"):
            await _delete_account(user)

    storage.delete_file.assert_not_called()


# Look like stored-file references but are not (file_path columns are covered by the cleanup).
NOT_STORED_FILE_COLUMNS: dict[str, str] = {
    "application_contacts.linkedin_url": "Link to a LinkedIn profile",
    "applications.url": "Link to the job posting",
    "companies.logo_url": "External logo link",
    "discovered_jobs.source_url": "Link to the job posting",
    "documents.filename": "Original upload name; the stored key is file_path",
    "job_analyses.source_url": "Link to the job posting",
    "research_sources.url": "Link to a web source",
    "resume_upload_jobs.file_filename": "Original upload name; the stored key is file_path",
    "screening_answers.question_key": "Identifier of a screening question, not a file",
}


# RESTRICT foreign keys between rows the user's delete cascades to. A new one needs the same
# look: run the delete against migrated Postgres, then add it here.
KNOWN_BLOCKING_FOREIGN_KEYS: dict[str, str] = {
    "applications.company_id": (
        "Both rows cascade from the user, and RESTRICT is checked immediately. prepare_deletion "
        "deletes the user's applications first, so the order no longer depends on cascade luck; "
        "the key stays RESTRICT so deleting a company still refuses while applications use it"
    ),
}


def _columns_covered_by_the_cleanup() -> set[str]:
    return {
        f"{column['expr'].table.name}.{column['expr'].name}"
        for query in account_files_repo._queries(uuid.uuid4())
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


def test_foreign_keys_that_can_block_deleting_a_user_have_all_been_checked() -> None:
    blocking = set(foreign_keys_blocking_user_deletion(Base.metadata, User.__table__.name))
    assert blocking == set(KNOWN_BLOCKING_FOREIGN_KEYS)
    assert entries_without_reason(KNOWN_BLOCKING_FOREIGN_KEYS) == []
