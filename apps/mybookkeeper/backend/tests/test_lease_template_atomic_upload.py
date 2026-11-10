"""Uploading or replacing a lease template's files is all-or-nothing.

Real database rows (in-memory SQLite, genuine commit/rollback) and a fake
storage client whose calls are asserted: a failure leaves no template, file or
placeholder rows behind, and never strands or prematurely removes an object.

SQLite cannot exercise row locking or concurrent writers; the ``FOR UPDATE``
and SQL-side version bump are asserted on the compiled PostgreSQL statements in
``test_lease_template_replace_locking.py``.
"""
from __future__ import annotations

import asyncio
import logging
import threading
from unittest.mock import ANY, MagicMock, patch

import pytest
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.commit_outcome_constants import OUTCOME_CHECK_LOCK_TIMEOUT_MS
from app.core.lease_template_constants import MAX_LEASE_TEMPLATE_FILES
from app.repositories import lock_timeout_repo
from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_placeholder_repo,
    lease_template_repo,
)
from app.services.leases import lease_template_service, lease_template_upload_service
from app.services.leases.lease_template_placeholder_service import TemplateNotFoundError
from app.services.leases.lease_template_service import (
    TemplateFileTooLargeError,
    TemplateFileTypeRejectedError,
    TemplateFileUnreadableError,
    TemplateNoFilesError,
    TemplateStorageUnavailableError,
    TemplateTooManyFilesError,
)
from tests.lease_template_upload_support import (
    CORRUPT_DOCX,
    DOCX,
    MARKDOWN,
    PLAIN,
    UPLOAD_SERVICE,
    CommitFailedError,
    UnitOfWorkFactory,
    commit_succeeds_then_raises,
    count_rows,
    deleted_keys,
    failing_commit,
    new_tenant,
    real_unit_of_work,  # noqa: F401 — fixture
    storage,  # noqa: F401 — fixture
    upload_fails_on_call,
    uploaded_keys,
)

BUNDLE = [("lease.md", MARKDOWN, "text/markdown"), ("rules.txt", PLAIN, "text/plain")]


async def _upload(user_id, org_id, files=BUNDLE):
    return await lease_template_upload_service.upload_template(
        user_id=user_id, organization_id=org_id, name="Lease", description=None, files=files,
    )


@pytest.mark.asyncio
async def test_upload_happy_path(db: AsyncSession, real_unit_of_work, storage: MagicMock) -> None:
    user_id, org_id = new_tenant()

    result = await _upload(user_id, org_id)

    assert await count_rows(db) == (1, 2, 1)
    assert [f.filename for f in result.files] == ["lease.md", "rules.txt"]
    assert [p.key for p in result.placeholders] == ["TENANT FULL NAME"]
    assert sorted(f.storage_key for f in result.files) == sorted(uploaded_keys(storage))
    assert all(k.startswith(f"lease-templates/{result.id}/") for k in uploaded_keys(storage))
    storage.delete_files.assert_not_called()


@pytest.mark.asyncio
async def test_storage_failure_on_second_file_writes_nothing_and_removes_uploads(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    upload_fails_on_call(storage, 2)

    with pytest.raises(TemplateStorageUnavailableError):
        await _upload(*new_tenant())

    assert await count_rows(db) == (0, 0, 0)
    keys = uploaded_keys(storage)
    assert len(keys) == 2
    # The failed attempt's key is removed too: it may have been partly written.
    assert sorted(deleted_keys(storage)) == sorted(keys)


@pytest.mark.asyncio
async def test_commit_phase_error_on_create_keeps_objects_even_when_rows_look_absent(
    db: AsyncSession, real_unit_of_work: UnitOfWorkFactory, storage: MagicMock,
) -> None:
    """Creating a template has no existing row to lock, so a read that sees nothing
    may simply have run before an in-flight COMMIT became visible: absence is not
    proof. The objects are kept (possibly unreferenced) rather than risk deleting
    ones a committed row points at."""
    with patch(f"{UPLOAD_SERVICE}.unit_of_work", failing_commit(real_unit_of_work)):
        with pytest.raises(CommitFailedError):
            await _upload(*new_tenant())

    assert await count_rows(db) == (0, 0, 0)
    assert len(uploaded_keys(storage)) == 2
    storage.delete_files.assert_not_called()


@pytest.mark.asyncio
async def test_body_failure_on_create_still_removes_uploaded_objects(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    with patch(
        "app.repositories.leases.lease_template_bundle_repo.lease_template_file_repo.create_many",
        side_effect=ValueError("bad row"),
    ):
        with pytest.raises(ValueError):
            await _upload(*new_tenant())

    assert sorted(deleted_keys(storage)) == sorted(uploaded_keys(storage))


@pytest.mark.asyncio
async def test_commit_error_after_rows_committed_keeps_objects_and_succeeds(
    db: AsyncSession, real_unit_of_work: UnitOfWorkFactory, storage: MagicMock,
) -> None:
    with patch(f"{UPLOAD_SERVICE}.unit_of_work", commit_succeeds_then_raises(real_unit_of_work)):
        result = await _upload(*new_tenant())

    assert await count_rows(db) == (1, 2, 1)
    assert sorted(f.storage_key for f in result.files) == sorted(uploaded_keys(storage))
    storage.delete_files.assert_not_called()


@pytest.mark.asyncio
async def test_unknown_commit_outcome_with_failed_check_keeps_objects_and_logs(
    db: AsyncSession,
    real_unit_of_work: UnitOfWorkFactory,
    storage: MagicMock,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with (
        patch(
            f"{UPLOAD_SERVICE}.unit_of_work",
            failing_commit(real_unit_of_work, unreachable_after=True),
        ),
        caplog.at_level(logging.ERROR),
    ):
        with pytest.raises(CommitFailedError):
            await _upload(*new_tenant())

    storage.delete_files.assert_not_called()
    assert any("keeping uploaded objects" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_failure_before_commit_removes_objects_without_consulting_the_database(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    with (
        patch(
            "app.repositories.leases.lease_template_bundle_repo.lease_template_file_repo.create_many",
            side_effect=ValueError("bad row"),
        ),
        patch(f"{UPLOAD_SERVICE}.unit_of_work", failing_commit(real_unit_of_work, unreachable_after=True)),
    ):
        with pytest.raises(ValueError):
            await _upload(*new_tenant())

    assert sorted(deleted_keys(storage)) == sorted(uploaded_keys(storage))


@pytest.mark.asyncio
async def test_cancellation_mid_upload_removes_the_object_still_being_written(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    started, release = threading.Event(), threading.Event()
    order: list[str] = []

    def slow_upload(key: str, content: bytes, content_type: str) -> str:
        started.set()
        release.wait(5)
        order.append("upload_done")
        return key

    def record_delete(keys: list[str]) -> list[str]:
        order.append("delete")
        return []

    storage.upload_file.side_effect = slow_upload
    storage.delete_files.side_effect = record_delete

    task = asyncio.ensure_future(_upload(*new_tenant()))
    await asyncio.to_thread(started.wait, 5)
    task.cancel()
    await asyncio.sleep(0.05)
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert await count_rows(db) == (0, 0, 0)
    assert order == ["upload_done", "delete"]
    assert deleted_keys(storage) == [storage.upload_file.call_args.args[0]]


@pytest.mark.asyncio
async def test_unsupported_file_mid_bundle_writes_and_uploads_nothing(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    files = [BUNDLE[0], ("evil.exe", b"MZ", "application/x-msdownload"), BUNDLE[1]]

    with pytest.raises(TemplateFileTypeRejectedError):
        await _upload(*new_tenant(), files=files)

    assert await count_rows(db) == (0, 0, 0)
    storage.upload_file.assert_not_called()
    storage.delete_files.assert_not_called()


@pytest.mark.asyncio
async def test_corrupt_docx_mid_bundle_is_rejected_and_writes_nothing(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    files = [BUNDLE[0], ("broken.docx", CORRUPT_DOCX, DOCX), BUNDLE[1]]

    with pytest.raises(TemplateFileUnreadableError) as excinfo:
        await _upload(*new_tenant(), files=files)

    assert "broken.docx could not be read" in str(excinfo.value)
    assert await count_rows(db) == (0, 0, 0)
    storage.upload_file.assert_not_called()


@pytest.mark.asyncio
async def test_too_many_files_rejected_before_anything_is_read_or_written(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    files = [(f"f{i}.txt", b"x", "text/plain") for i in range(MAX_LEASE_TEMPLATE_FILES + 1)]

    with pytest.raises(TemplateTooManyFilesError):
        await _upload(*new_tenant(), files=files)

    assert await count_rows(db) == (0, 0, 0)
    storage.upload_file.assert_not_called()


@pytest.mark.asyncio
async def test_zero_files_rejected_before_anything_is_written(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    with pytest.raises(TemplateNoFilesError):
        await _upload(*new_tenant(), files=[])

    assert await count_rows(db) == (0, 0, 0)
    storage.upload_file.assert_not_called()


@pytest.mark.asyncio
async def test_oversized_file_is_rejected_with_a_correctly_formatted_limit(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    files = [("big.txt", b"x" * 1_600_000, "text/plain")]

    with patch(f"{UPLOAD_SERVICE}.settings.max_lease_template_file_size_bytes", int(1.5 * 1024 * 1024)):
        with pytest.raises(TemplateFileTooLargeError) as caught:
            await _upload(*new_tenant(), files=files)

    assert str(caught.value) == "big.txt exceeds 1.5MB limit"
    assert await count_rows(db) == (0, 0, 0)
    storage.upload_file.assert_not_called()


@pytest.mark.asyncio
async def test_placeholder_parse_failure_writes_nothing_and_uploads_nothing(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    with patch(f"{UPLOAD_SERVICE}.extract_placeholders_across_files", side_effect=ValueError("boom")):
        with pytest.raises(ValueError):
            await _upload(*new_tenant())

    assert await count_rows(db) == (0, 0, 0)
    storage.upload_file.assert_not_called()


# ---------------------------------------------------------------------------
# replace files
# ---------------------------------------------------------------------------

SEED_BUNDLE = [(
    "lease.md",
    b"[TENANT FULL NAME] [MOVE IN DATE] [PET NAME]",
    "text/markdown",
)]
NEW_BUNDLE = [
    ("new.md", b"New [TENANT FULL NAME] and [MOVE IN DATE] and [MONTHLY RENT]", "text/markdown"),
    ("extra.txt", b"extra", "text/plain"),
]


async def _seed_and_edit(db: AsyncSession, storage: MagicMock):
    """Upload a template, then give two placeholders host edits."""
    user_id, org_id = new_tenant()
    created = await _upload(user_id, org_id, files=SEED_BUNDLE)
    old_keys = sorted(f.storage_key for f in created.files)
    rows = {
        p.key: p
        for p in await lease_template_placeholder_repo.list_for_template(db, template_id=created.id)
    }
    tenant, move_in = rows["TENANT FULL NAME"], rows["MOVE IN DATE"]
    tenant.display_label = "Host edited label"
    tenant.required = False
    tenant.input_type = "email"
    tenant.default_source = "applicant.legal_name"
    tenant.display_order = 7
    move_in.input_type = "computed"
    move_in.computed_expr = "today()"
    move_in.display_order = 3
    await db.commit()
    storage.upload_file.reset_mock()
    storage.delete_files.reset_mock()
    return user_id, org_id, created.id, old_keys


async def _replace(user_id, org_id, template_id, files=NEW_BUNDLE):
    return await lease_template_upload_service.replace_template_files(
        user_id=user_id, organization_id=org_id, template_id=template_id, files=files,
    )


@pytest.mark.asyncio
async def test_replace_happy_path_swaps_files_and_deletes_old_after_commit(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    user_id, org_id, template_id, old_keys = await _seed_and_edit(db, storage)

    result = await _replace(user_id, org_id, template_id)

    assert result.version == 2
    assert [f.filename for f in result.files] == ["new.md", "extra.txt"]
    assert sorted(f.storage_key for f in result.files) == sorted(uploaded_keys(storage))
    assert sorted(deleted_keys(storage)) == old_keys


@pytest.mark.asyncio
async def test_replace_restores_every_host_edit_and_drops_vanished_keys(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    user_id, org_id, template_id, _ = await _seed_and_edit(db, storage)

    result = await _replace(user_id, org_id, template_id)

    by_key = {p.key: p for p in result.placeholders}
    assert set(by_key) == {"TENANT FULL NAME", "MOVE IN DATE", "MONTHLY RENT"}  # PET NAME dropped
    tenant, move_in, rent = by_key["TENANT FULL NAME"], by_key["MOVE IN DATE"], by_key["MONTHLY RENT"]
    assert (tenant.display_label, tenant.required, tenant.input_type) == ("Host edited label", False, "email")
    assert tenant.default_source == "applicant.legal_name"
    assert tenant.display_order == 7
    assert (move_in.input_type, move_in.computed_expr, move_in.display_order) == ("computed", "today()", 3)
    assert rent.display_order == 8  # new keys follow the highest surviving position
    assert rent.display_label != "Host edited label"


@pytest.mark.asyncio
async def test_replace_storage_failure_keeps_old_files_and_objects(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    user_id, org_id, template_id, old_keys = await _seed_and_edit(db, storage)
    upload_fails_on_call(storage, 2)

    with pytest.raises(TemplateStorageUnavailableError):
        await _replace(user_id, org_id, template_id)

    db.expire_all()
    files = await lease_template_file_repo.list_for_template(db, template_id=template_id)
    assert sorted(f.storage_key for f in files) == old_keys
    template = await lease_template_repo.get(db, template_id=template_id, user_id=user_id, organization_id=org_id)
    assert template is not None and template.version == 1
    assert len(await lease_template_placeholder_repo.list_for_template(db, template_id=template_id)) == 3
    assert sorted(deleted_keys(storage)) == sorted(uploaded_keys(storage))
    assert not set(old_keys) & set(deleted_keys(storage))


@pytest.mark.asyncio
async def test_replace_commit_failure_keeps_old_files_and_removes_only_new_objects(
    db: AsyncSession, real_unit_of_work: UnitOfWorkFactory, storage: MagicMock,
) -> None:
    user_id, org_id, template_id, old_keys = await _seed_and_edit(db, storage)

    with patch(f"{UPLOAD_SERVICE}.unit_of_work", failing_commit(real_unit_of_work, on_call=2)):
        with pytest.raises(CommitFailedError):
            await _replace(user_id, org_id, template_id)

    db.expire_all()
    files = await lease_template_file_repo.list_for_template(db, template_id=template_id)
    assert sorted(f.storage_key for f in files) == old_keys
    placeholders = await lease_template_placeholder_repo.list_for_template(db, template_id=template_id)
    assert "Host edited label" in [p.display_label for p in placeholders]
    assert uploaded_keys(storage)
    assert sorted(deleted_keys(storage)) == sorted(uploaded_keys(storage))
    assert not set(old_keys) & set(deleted_keys(storage))


@pytest.mark.asyncio
async def test_replace_outcome_check_locks_the_template_row_with_a_lock_timeout(
    db: AsyncSession, real_unit_of_work: UnitOfWorkFactory, storage: MagicMock,
) -> None:
    user_id, org_id, template_id, _ = await _seed_and_edit(db, storage)

    with (
        patch(f"{UPLOAD_SERVICE}.unit_of_work", failing_commit(real_unit_of_work, on_call=2)),
        patch.object(lease_template_repo, "get", wraps=lease_template_repo.get) as get,
        patch.object(
            lock_timeout_repo, "set_local_lock_timeout", wraps=lock_timeout_repo.set_local_lock_timeout,
        ) as set_timeout,
    ):
        with pytest.raises(CommitFailedError):
            await _replace(user_id, org_id, template_id)

    # The pre-check and the write take the lock too; the outcome check is the last get.
    assert get.call_args_list[-1].kwargs["for_update"] is True
    assert get.call_args_list[-1].kwargs["include_deleted"] is True
    set_timeout.assert_awaited_once_with(ANY, OUTCOME_CHECK_LOCK_TIMEOUT_MS)


@pytest.mark.asyncio
async def test_replace_outcome_check_lock_timeout_keeps_all_objects_and_logs(
    db: AsyncSession,
    real_unit_of_work: UnitOfWorkFactory,
    storage: MagicMock,
    caplog: pytest.LogCaptureFixture,
) -> None:
    user_id, org_id, template_id, _ = await _seed_and_edit(db, storage)
    real_get = lease_template_repo.get
    calls = {"n": 0}

    async def get_then_time_out(*args, **kwargs):
        calls["n"] += 1
        if kwargs.get("include_deleted"):  # only the outcome check asks for deleted rows too
            raise OperationalError("SELECT", {}, Exception("canceling statement due to lock timeout"))
        return await real_get(*args, **kwargs)

    with (
        patch(f"{UPLOAD_SERVICE}.unit_of_work", failing_commit(real_unit_of_work, on_call=2)),
        patch.object(lease_template_repo, "get", get_then_time_out),
        caplog.at_level(logging.ERROR),
    ):
        with pytest.raises(CommitFailedError):
            await _replace(user_id, org_id, template_id)

    storage.delete_files.assert_not_called()
    assert any("keeping uploaded objects" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_replace_commit_error_after_commit_keeps_new_objects_and_removes_old(
    db: AsyncSession, real_unit_of_work: UnitOfWorkFactory, storage: MagicMock,
) -> None:
    user_id, org_id, template_id, old_keys = await _seed_and_edit(db, storage)

    with patch(f"{UPLOAD_SERVICE}.unit_of_work", commit_succeeds_then_raises(real_unit_of_work, on_call=2)):
        result = await _replace(user_id, org_id, template_id)

    assert result.version == 2
    assert sorted(deleted_keys(storage)) == old_keys
    assert not set(uploaded_keys(storage)) & set(deleted_keys(storage))


@pytest.mark.asyncio
async def test_replace_corrupt_docx_changes_nothing(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    user_id, org_id, template_id, old_keys = await _seed_and_edit(db, storage)

    with pytest.raises(TemplateFileUnreadableError):
        await _replace(user_id, org_id, template_id, files=[("bad.docx", CORRUPT_DOCX, DOCX)])

    db.expire_all()
    stored = await lease_template_file_repo.list_for_template(db, template_id=template_id)
    assert sorted(f.storage_key for f in stored) == old_keys
    storage.upload_file.assert_not_called()
    storage.delete_files.assert_not_called()


@pytest.mark.asyncio
async def test_replace_bad_file_mid_bundle_changes_nothing(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    user_id, org_id, template_id, old_keys = await _seed_and_edit(db, storage)
    files = [NEW_BUNDLE[0], ("evil.exe", b"MZ", "application/x-msdownload")]

    with pytest.raises(TemplateFileTypeRejectedError):
        await _replace(user_id, org_id, template_id, files=files)

    db.expire_all()
    stored = await lease_template_file_repo.list_for_template(db, template_id=template_id)
    assert sorted(f.storage_key for f in stored) == old_keys
    storage.upload_file.assert_not_called()
    storage.delete_files.assert_not_called()


@pytest.mark.asyncio
async def test_replace_cancellation_mid_upload_keeps_old_files_and_removes_new_object(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    user_id, org_id, template_id, old_keys = await _seed_and_edit(db, storage)
    started, release = threading.Event(), threading.Event()

    def slow_upload(key: str, content: bytes, content_type: str) -> str:
        started.set()
        release.wait(5)
        return key

    storage.upload_file.side_effect = slow_upload
    task = asyncio.ensure_future(_replace(user_id, org_id, template_id))
    await asyncio.to_thread(started.wait, 5)
    task.cancel()
    await asyncio.sleep(0.05)
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task

    db.expire_all()
    stored = await lease_template_file_repo.list_for_template(db, template_id=template_id)
    assert sorted(f.storage_key for f in stored) == old_keys
    assert deleted_keys(storage) == [storage.upload_file.call_args.args[0]]


@pytest.mark.asyncio
async def test_replace_unknown_template_uploads_nothing(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    user_id, org_id = new_tenant()

    with pytest.raises(TemplateNotFoundError):
        await _replace(user_id, org_id, new_tenant()[0])

    storage.upload_file.assert_not_called()


@pytest.mark.asyncio
async def test_replace_integrity_error_becomes_a_conflict_not_a_raw_error(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    user_id, org_id, template_id, old_keys = await _seed_and_edit(db, storage)

    with patch(
        "app.repositories.leases.lease_template_bundle_repo.lease_template_placeholder_repo.create_many",
        side_effect=IntegrityError("insert", {}, Exception("uq_lease_template_placeholders_template_id_key")),
    ):
        with pytest.raises(lease_template_upload_service.TemplateWriteConflictError):
            await _replace(user_id, org_id, template_id)

    db.expire_all()
    stored = await lease_template_file_repo.list_for_template(db, template_id=template_id)
    assert sorted(f.storage_key for f in stored) == old_keys
    assert sorted(deleted_keys(storage)) == sorted(uploaded_keys(storage))


# ---------------------------------------------------------------------------
# legacy rows left by the old non-atomic upload
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_template_with_no_files_lists_opens_and_deletes(
    db: AsyncSession, real_unit_of_work, storage: MagicMock,
) -> None:
    user_id, org_id = new_tenant()
    template = await lease_template_repo.create(
        db, user_id=user_id, organization_id=org_id, name="Broken leftover",
    )
    await db.commit()

    listing = await lease_template_service.list_templates(user_id=user_id, organization_id=org_id)
    detail = await lease_template_service.get_template(
        user_id=user_id, organization_id=org_id, template_id=template.id,
    )
    assert [(i.id, i.file_count, i.placeholder_count) for i in listing.items] == [(template.id, 0, 0)]
    assert detail.files == [] and detail.placeholders == []

    await lease_template_service.soft_delete_template(
        user_id=user_id, organization_id=org_id, template_id=template.id,
    )
    after = await lease_template_service.list_templates(user_id=user_id, organization_id=org_id)
    assert after.items == []
