"""Regenerating or generating a lease never loses its documents.

The old rendered attachments are removed only in the same (lease-locked)
transaction that records the new ones, after every new file rendered and
uploaded, and their objects are deleted only once that commit is confirmed.
Sessions are real (commit and rollback are genuine), so a failed commit really
rolls back. SQLite cannot exercise row locks; the lock is asserted via the
statement compiled for PostgreSQL and a spy on the repo call.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from unittest.mock import ANY, AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.commit_outcome_constants import OUTCOME_CHECK_LOCK_TIMEOUT_MS
from app.repositories import lock_timeout_repo
from app.repositories.leases import (
    lease_template_file_repo,
    signed_lease_repo,
    signed_lease_template_repo,
)
from app.services.leases.lease_pdf_service import add_templates_and_generate, generate_lease
from app.services.storage.stored_file import StoredFileMissingError
from tests.lease_regenerate_support import (
    OLD_KEY,
    PDF,
    RENDER,
    deleted,
    lease_with_rendered_attachment,
    patches,
    real_uow,  # noqa: F401 — fixture
    regenerate,
    rendered_keys,
    second_template,
    storage_double,
)
from tests.lease_template_upload_support import (
    CommitFailedError,
    UnitOfWorkFactory,
    commit_succeeds_then_raises,
    failing_commit,
)

@pytest.mark.asyncio
async def test_regenerate_replaces_old_attachment_only_after_new_one_is_stored(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, template, lease, old = await lease_with_rendered_attachment(db)
    storage = storage_double()

    result = await regenerate(storage, user_id, org_id, lease, [template.id])

    rendered = [a for a in result.attachments if a.kind == "rendered_original"]
    assert len(rendered) == 1 and rendered[0].id != old.id
    storage.upload_file.assert_called_once()
    storage.delete_files.assert_called_once_with([OLD_KEY])


@pytest.mark.asyncio
async def test_regenerate_with_vanished_template_object_keeps_old_attachments(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, template, lease, old = await lease_with_rendered_attachment(db)
    lease_id = lease.id
    storage = storage_double(missing=True)

    with pytest.raises(StoredFileMissingError):
        await regenerate(storage, user_id, org_id, lease, [template.id])

    assert await rendered_keys(db, lease_id) == [OLD_KEY]
    storage.upload_file.assert_not_called()
    assert OLD_KEY not in deleted(storage)


@pytest.mark.asyncio
async def test_regenerate_render_failure_keeps_old_attachments_and_removes_new_uploads(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, template, lease, old = await lease_with_rendered_attachment(db)
    lease_id = lease.id
    await lease_template_file_repo.create(
        db,
        template_id=template.id,
        filename="second.md",
        storage_key=f"lease-templates/{template.id}/f2",
        content_type="text/markdown",
        size_bytes=7,
        display_order=1,
    )
    await db.commit()
    storage = storage_double()
    renders = {"n": 0}

    def render_second_fails(text: str, subs: dict[str, str]) -> str:
        renders["n"] += 1
        if renders["n"] == 2:
            raise ValueError("render failed")
        return "# Hello"

    p = patches(storage)
    with p[0], p[1], p[3], patch(f"{RENDER}.render_md", side_effect=render_second_fails):
        with pytest.raises(ValueError):
            await add_templates_and_generate(
                user_id=user_id, organization_id=org_id, lease_id=lease_id,
                template_ids=[template.id], today=_dt.date(2026, 1, 1),
            )

    assert await rendered_keys(db, lease_id) == [OLD_KEY]
    uploaded = [c.args[0] for c in storage.upload_file.call_args_list]
    assert len(uploaded) == 1 and set(uploaded) <= set(deleted(storage))
    assert OLD_KEY not in deleted(storage)


@pytest.mark.asyncio
async def test_regenerate_commit_failure_rolls_back_links_and_keeps_old_documents(
    db: AsyncSession, real_uow: UnitOfWorkFactory,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    extra = await second_template(db, user_id, org_id)
    lease_id, template_id, extra_id = lease.id, template.id, extra.id
    storage = storage_double()

    # Use 1 is the read; use 2 is the write transaction whose commit fails.
    with patch(f"{PDF}.unit_of_work", failing_commit(real_uow, on_call=2)):
        with pytest.raises(CommitFailedError):
            await regenerate(storage, user_id, org_id, lease, [template_id, extra_id])

    assert await rendered_keys(db, lease_id) == [OLD_KEY]
    links = await signed_lease_template_repo.list_for_lease(db, lease_id=lease_id)
    assert [r.template_id for r in links] == [template_id]
    uploaded = [c.args[0] for c in storage.upload_file.call_args_list]
    assert uploaded and sorted(deleted(storage)) == sorted(uploaded)


@pytest.mark.asyncio
async def test_regenerate_commit_error_after_commit_landed_keeps_new_and_drops_old(
    db: AsyncSession, real_uow: UnitOfWorkFactory,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    lease_id = lease.id
    storage = storage_double()

    with patch(f"{PDF}.unit_of_work", commit_succeeds_then_raises(real_uow, on_call=2)):
        await regenerate(storage, user_id, org_id, lease, [template.id])

    uploaded = [c.args[0] for c in storage.upload_file.call_args_list]
    assert await rendered_keys(db, lease_id) == sorted(uploaded)
    assert deleted(storage) == [OLD_KEY]


@pytest.mark.asyncio
async def test_regenerate_locks_the_lease_row_before_replacing_documents(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    storage = storage_double()

    with patch.object(signed_lease_repo, "get", wraps=signed_lease_repo.get) as spy:
        await regenerate(storage, user_id, org_id, lease, [template.id])

    assert any(c.kwargs.get("for_update") is True for c in spy.call_args_list)


@pytest.mark.asyncio
async def test_lease_get_for_update_compiles_to_for_update() -> None:
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock())
    await signed_lease_repo.get(
        db, lease_id=uuid.uuid4(), user_id=uuid.uuid4(), organization_id=uuid.uuid4(), for_update=True,
    )
    stmt = db.execute.call_args.args[0]

    assert "FOR UPDATE" in str(stmt.compile(dialect=postgresql.dialect()))


@pytest.mark.asyncio
async def test_generate_twice_replaces_the_earlier_rendered_documents(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    lease_id = lease.id
    storage = storage_double()
    p = patches(storage)

    with p[0], p[1], p[2], p[3]:
        for _ in range(2):
            await generate_lease(
                user_id=user_id, organization_id=org_id, lease_id=lease_id, today=_dt.date(2026, 1, 1),
            )

    uploaded = [c.args[0] for c in storage.upload_file.call_args_list]
    assert len(uploaded) == 2
    assert await rendered_keys(db, lease_id) == [uploaded[1]]
    assert set(deleted(storage)) == {OLD_KEY, uploaded[0]}


@pytest.mark.asyncio
async def test_generate_commit_failure_keeps_old_documents_and_removes_new_uploads(
    db: AsyncSession, real_uow: UnitOfWorkFactory,
) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    lease_id = lease.id
    storage = storage_double()
    p = patches(storage)

    # Use 1 is the read; use 2 is the write transaction whose commit fails.
    with p[0], p[1], p[2], p[3], patch(f"{PDF}.unit_of_work", failing_commit(real_uow, on_call=2)):
        with pytest.raises(CommitFailedError):
            await generate_lease(
                user_id=user_id, organization_id=org_id, lease_id=lease_id, today=_dt.date(2026, 1, 1),
            )

    assert await rendered_keys(db, lease_id) == [OLD_KEY]
    uploaded = [c.args[0] for c in storage.upload_file.call_args_list]
    assert uploaded and sorted(deleted(storage)) == sorted(uploaded)


@pytest.mark.asyncio
async def test_plain_generate_with_vanished_template_object_fails_cleanly(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    lease_id = lease.id
    storage = storage_double(missing=True)

    with patch(f"{PDF}.get_storage", return_value=storage):
        with pytest.raises(StoredFileMissingError):
            await generate_lease(
                user_id=user_id, organization_id=org_id, lease_id=lease_id, today=_dt.date(2026, 1, 1),
            )

    assert await rendered_keys(db, lease_id) == [OLD_KEY]


@pytest.mark.asyncio
async def test_outcome_check_locks_the_lease_row_with_a_lock_timeout(
    db: AsyncSession, real_uow: UnitOfWorkFactory,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    template_id = template.id
    storage = storage_double()

    with (
        patch(f"{PDF}.unit_of_work", failing_commit(real_uow, on_call=2)),
        patch.object(signed_lease_repo, "get", wraps=signed_lease_repo.get) as get,
        patch.object(
            lock_timeout_repo, "set_local_lock_timeout", wraps=lock_timeout_repo.set_local_lock_timeout,
        ) as set_timeout,
    ):
        with pytest.raises(CommitFailedError):
            await regenerate(storage, user_id, org_id, lease, [template_id])

    assert get.call_args_list[-1].kwargs["for_update"] is True
    assert get.call_args_list[-1].kwargs["include_deleted"] is True
    set_timeout.assert_awaited_once_with(ANY, OUTCOME_CHECK_LOCK_TIMEOUT_MS)


@pytest.mark.asyncio
async def test_outcome_check_lock_timeout_keeps_all_objects_and_logs(
    db: AsyncSession, real_uow: UnitOfWorkFactory, caplog: pytest.LogCaptureFixture,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    template_id = template.id
    storage = storage_double()
    real_get = signed_lease_repo.get

    async def get_then_time_out(*args, **kwargs):
        if kwargs.get("include_deleted"):  # only the outcome check asks for deleted rows too
            raise OperationalError("SELECT", {}, Exception("canceling statement due to lock timeout"))
        return await real_get(*args, **kwargs)

    with (
        patch(f"{PDF}.unit_of_work", failing_commit(real_uow, on_call=2)),
        patch.object(signed_lease_repo, "get", get_then_time_out),
        caplog.at_level(logging.ERROR),
    ):
        with pytest.raises(CommitFailedError):
            await regenerate(storage, user_id, org_id, lease, [template_id])

    storage.delete_files.assert_not_called()
    assert any("keeping uploaded objects" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_set_local_lock_timeout_is_issued_on_postgresql_only() -> None:
    postgres, sqlite = MagicMock(), MagicMock()
    postgres.get_bind.return_value.dialect.name = "postgresql"
    sqlite.get_bind.return_value.dialect.name = "sqlite"
    postgres.execute, sqlite.execute = AsyncMock(), AsyncMock()

    await lock_timeout_repo.set_local_lock_timeout(postgres, 2000)
    await lock_timeout_repo.set_local_lock_timeout(sqlite, 2000)

    assert str(postgres.execute.call_args.args[0]) == "SET LOCAL lock_timeout = 2000"
    sqlite.execute.assert_not_called()
