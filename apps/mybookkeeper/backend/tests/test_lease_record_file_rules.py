"""Which files a locked lease still takes, gives up, or relabels.

A lease locks when it is past generated, has been emailed, or holds a signed
copy. Then no more rendered originals can appear, and an original or signed
file only goes if it was added after the lock and was never in a tenant email.
"""
from __future__ import annotations

import datetime as _dt
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.signed_lease_attachment import SignedLeaseAttachment

from app.repositories.leases import signed_lease_attachment_repo, signed_lease_repo
from app.services.leases import lease_attachment_service
from app.services.leases.exceptions.lease_attachment_locked_error import LeaseAttachmentLockedError
from app.services.leases.lease_attachment_service import (
    delete_attachment,
    update_attachment_kind,
    update_attachment_signing_state,
    upload_attachment,
)
from app.services.leases._lease_helpers import CannotEditValuesError
from app.services.leases.lease_lifecycle_service import get_lease, update_lease
from tests.lease_regenerate_support import lease_with_rendered_attachment, real_uow  # noqa: F401 — fixture

SVC = "app.services.leases.lease_attachment_service"
T = _dt.datetime(2026, 3, 1, 12, tzinfo=_dt.timezone.utc)
HOUR = _dt.timedelta(hours=1)


@pytest.fixture(autouse=True)
def _own_transactions(real_uow, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    monkeypatch.setattr(f"{SVC}.unit_of_work", real_uow)
    monkeypatch.setattr("app.services.leases.lease_lifecycle_service.unit_of_work", real_uow)


async def _lease_fields(db: AsyncSession, lease, user_id, org_id, **fields) -> None:
    await signed_lease_repo.update_lease(
        db, lease_id=lease.id, user_id=user_id, organization_id=org_id, fields=fields,
    )
    await db.commit()


async def _file(db: AsyncSession, lease_id, user_id, *, kind: str, at: _dt.datetime, **extra):
    row = await signed_lease_attachment_repo.create(
        db, lease_id=lease_id, storage_key=f"signed-leases/x/{kind}-{at.isoformat()}", filename=f"{kind}.pdf",
        content_type="application/pdf", size_bytes=1, kind=kind, uploaded_by_user_id=user_id, uploaded_at=at, **extra,
    )
    await db.commit()
    return row.id


def _upload(user_id, org_id, lease_id, kind: str):
    storage = MagicMock()
    cleaned = SimpleNamespace(content=b"%PDF", content_type="application/pdf")

    def clean(*_a, **_k):
        return cleaned

    patcher = (
        patch(f"{SVC}.get_storage", return_value=storage),
        patch(f"{SVC}.clean_attachment", side_effect=clean),
        patch(f"{SVC}.attach_presigned_urls_to_attachments", side_effect=lambda rows: rows),
    )
    return storage, patcher, dict(
        user_id=user_id, organization_id=org_id, lease_id=lease_id, content=b"x", filename="f.pdf", kind=kind,
    )


async def _attempt_upload(user_id, org_id, lease_id, kind: str):
    storage, p, args = _upload(user_id, org_id, lease_id, kind)
    with p[0], p[1], p[2]:
        result = await upload_attachment(**args)
    return storage, result


LOCKING = [
    pytest.param({"status": "sent"}, id="sent"),
    pytest.param({"last_emailed_to_tenant_at": T}, id="emailed"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("fields", LOCKING)
async def test_a_new_original_cannot_be_uploaded_to_a_locked_lease(db: AsyncSession, fields: dict) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    await _lease_fields(db, lease, user_id, org_id, **fields)
    storage, p, args = _upload(user_id, org_id, lease.id, "rendered_original")

    with p[0], p[1], p[2], pytest.raises(LeaseAttachmentLockedError):
        await upload_attachment(**args)

    storage.upload_file.assert_not_called()
    assert len(await signed_lease_attachment_repo.list_by_lease(db, lease.id)) == 1


@pytest.mark.asyncio
async def test_a_signed_copy_locks_the_lease_against_new_originals(db: AsyncSession) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    await _attempt_upload(user_id, org_id, lease.id, "signed_lease")

    storage, p, args = _upload(user_id, org_id, lease.id, "rendered_original")
    with p[0], p[1], p[2], pytest.raises(LeaseAttachmentLockedError):
        await upload_attachment(**args)


@pytest.mark.asyncio
async def test_an_original_the_tenant_signed_locks_the_lease_against_new_originals(db: AsyncSession) -> None:
    user_id, org_id, _, lease, old = await lease_with_rendered_attachment(db)
    await signed_lease_attachment_repo.update_signing_state_scoped_to_lease(
        db, attachment_id=old.id, lease_id=lease.id, fields={"signed_by_tenant_at": T},
    )
    await db.commit()
    storage, p, args = _upload(user_id, org_id, lease.id, "rendered_original")

    with p[0], p[1], p[2], pytest.raises(LeaseAttachmentLockedError):
        await upload_attachment(**args)


@pytest.mark.asyncio
async def test_originals_and_signed_copies_upload_freely_while_the_lease_is_open(db: AsyncSession) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)

    _, original = await _attempt_upload(user_id, org_id, lease.id, "rendered_original")
    _, signed = await _attempt_upload(user_id, org_id, lease.id, "signed_lease")

    assert (original.kind, signed.kind) == ("rendered_original", "signed_lease")


@pytest.mark.asyncio
async def test_a_signed_copy_can_still_be_uploaded_to_a_locked_lease(db: AsyncSession) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    await _lease_fields(db, lease, user_id, org_id, status="sent")

    _, result = await _attempt_upload(user_id, org_id, lease.id, "signed_lease")

    assert result.kind == "signed_lease"


@pytest.mark.asyncio
async def test_a_lease_locked_while_the_file_is_read_refuses_it_and_removes_the_object(
    db: AsyncSession, real_uow, monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    lease_id = lease.id
    real_check = lease_attachment_service._ensure_original_upload_allowed
    calls = 0

    async def lock_after_the_first_check(check_db, check_lease, kind):
        nonlocal calls
        await real_check(check_db, check_lease, kind)
        calls += 1
        if calls == 1:
            async with real_uow() as other:
                await signed_lease_repo.update_lease(
                    other, lease_id=lease_id, user_id=user_id, organization_id=org_id, fields={"status": "sent"},
                )

    monkeypatch.setattr(lease_attachment_service, "_ensure_original_upload_allowed", lock_after_the_first_check)
    storage, p, args = _upload(user_id, org_id, lease_id, "rendered_original")

    with p[0], p[1], p[2], pytest.raises(LeaseAttachmentLockedError):
        await upload_attachment(**args)

    storage.delete_file.assert_called_once()
    db.expire_all()
    assert len(await signed_lease_attachment_repo.list_by_lease(db, lease_id)) == 1


async def _locked_lease_with_file(db: AsyncSession, *, kind: str, offset: _dt.timedelta, **lease_fields):
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    await _lease_fields(db, lease, user_id, org_id, **{"sent_at": T, "status": "sent", **lease_fields})
    file_id = await _file(db, lease.id, user_id, kind=kind, at=T + offset)
    return user_id, org_id, lease.id, file_id


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["rendered_original", "signed_lease"])
@pytest.mark.parametrize("offset", [-HOUR, _dt.timedelta(0)], ids=["before_lock", "at_lock"])
async def test_a_record_file_from_before_the_lock_cannot_be_deleted_or_relabelled(
    db: AsyncSession, kind: str, offset: _dt.timedelta,
) -> None:
    user_id, org_id, lease_id, file_id = await _locked_lease_with_file(db, kind=kind, offset=offset)
    ids = dict(user_id=user_id, organization_id=org_id, lease_id=lease_id, attachment_id=file_id)

    with pytest.raises(LeaseAttachmentLockedError):
        await delete_attachment(**ids)
    with pytest.raises(LeaseAttachmentLockedError):
        await update_attachment_kind(**ids, kind="other")


@pytest.mark.asyncio
async def test_an_original_added_after_the_lock_can_be_corrected(db: AsyncSession) -> None:
    user_id, org_id, lease_id, file_id = await _locked_lease_with_file(db, kind="rendered_original", offset=HOUR)
    ids = dict(user_id=user_id, organization_id=org_id, lease_id=lease_id, attachment_id=file_id)

    with patch(f"{SVC}.get_storage", return_value=MagicMock()), patch(
        f"{SVC}.attach_presigned_urls_to_attachments", side_effect=lambda rows: rows,
    ):
        relabelled = await update_attachment_kind(**ids, kind="other")
        await delete_attachment(**{**ids, "attachment_id": relabelled.id})

    db.expire_all()
    assert file_id not in {a.id for a in await signed_lease_attachment_repo.list_by_lease(db, lease_id)}


@pytest.mark.asyncio
async def test_the_first_signed_copy_stays_locked_even_when_it_arrived_after_the_lock(db: AsyncSession) -> None:
    user_id, org_id, lease_id, file_id = await _locked_lease_with_file(db, kind="signed_lease", offset=HOUR)

    with pytest.raises(LeaseAttachmentLockedError):
        await delete_attachment(user_id=user_id, organization_id=org_id, lease_id=lease_id, attachment_id=file_id)


@pytest.mark.asyncio
async def test_a_later_signed_copy_that_was_emailed_stays_locked(db: AsyncSession) -> None:
    user_id, org_id, lease_id, file_id = await _locked_lease_with_file(
        db, kind="signed_lease", offset=2 * HOUR, last_emailed_to_tenant_at=T + 3 * HOUR,
    )
    await _file(db, lease_id, user_id, kind="signed_lease", at=T + HOUR)
    await signed_lease_attachment_repo.set_emailed_to_tenant_at(db, lease_id=lease_id, stamps={file_id: T + 3 * HOUR})
    await db.commit()

    with pytest.raises(LeaseAttachmentLockedError):
        await delete_attachment(user_id=user_id, organization_id=org_id, lease_id=lease_id, attachment_id=file_id)


@pytest.mark.asyncio
async def test_a_later_signed_copy_added_after_the_last_email_can_still_be_corrected(db: AsyncSession) -> None:
    user_id, org_id, lease_id, file_id = await _locked_lease_with_file(
        db, kind="signed_lease", offset=3 * HOUR, last_emailed_to_tenant_at=T + HOUR,
    )
    await _file(db, lease_id, user_id, kind="signed_lease", at=T + HOUR)

    with patch(f"{SVC}.get_storage", return_value=MagicMock()):
        await delete_attachment(user_id=user_id, organization_id=org_id, lease_id=lease_id, attachment_id=file_id)


@pytest.mark.asyncio
@pytest.mark.parametrize("target", ["rendered_original", "signed_lease"])
async def test_a_locked_lease_will_not_relabel_a_file_into_the_record(db: AsyncSession, target: str) -> None:
    user_id, org_id, lease_id, file_id = await _locked_lease_with_file(db, kind="other", offset=HOUR)

    with pytest.raises(LeaseAttachmentLockedError):
        await update_attachment_kind(
            user_id=user_id, organization_id=org_id, lease_id=lease_id, attachment_id=file_id, kind=target,
        )


@pytest.mark.asyncio
async def test_the_only_signed_copy_cannot_be_deleted_or_relabelled_but_a_later_one_can(db: AsyncSession) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    first = await _file(db, lease.id, user_id, kind="signed_lease", at=T)
    later = await _file(db, lease.id, user_id, kind="signed_lease", at=T + HOUR)
    ids = dict(user_id=user_id, organization_id=org_id, lease_id=lease.id)

    with pytest.raises(LeaseAttachmentLockedError):
        await delete_attachment(**ids, attachment_id=first)
    with pytest.raises(LeaseAttachmentLockedError):
        await update_attachment_kind(**ids, attachment_id=first, kind="other")
    with patch(f"{SVC}.get_storage", return_value=MagicMock()):
        await delete_attachment(**ids, attachment_id=later)


@pytest.mark.asyncio
async def test_an_imported_leases_files_cannot_be_deleted(db: AsyncSession) -> None:
    """An import stamps the signing time and every file with one moment."""
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    await _lease_fields(db, lease, user_id, org_id, status="signed", signed_at=T)
    file_id = await _file(db, lease.id, user_id, kind="signed_lease", at=T)

    with pytest.raises(LeaseAttachmentLockedError):
        await delete_attachment(user_id=user_id, organization_id=org_id, lease_id=lease.id, attachment_id=file_id)


async def _set_signing(user_id, org_id, lease_id, attachment_id, **fields):
    return await update_attachment_signing_state(
        user_id=user_id, organization_id=org_id, lease_id=lease_id, attachment_id=attachment_id, signing_fields=fields,
    )


@pytest.mark.asyncio
async def test_the_tenant_signature_on_a_sent_lease_cannot_be_cleared(db: AsyncSession) -> None:
    user_id, org_id, _, lease, original = await lease_with_rendered_attachment(db)
    lease_id, original_id = lease.id, original.id
    await signed_lease_attachment_repo.update_signing_state_scoped_to_lease(
        db, attachment_id=original_id, lease_id=lease_id, fields={"signed_by_tenant_at": T},
    )
    await _lease_fields(db, lease, user_id, org_id, status="sent")

    with pytest.raises(LeaseAttachmentLockedError):
        await _set_signing(user_id, org_id, lease_id, original_id, signed_by_tenant_at=None)
    with pytest.raises(LeaseAttachmentLockedError):
        await _set_signing(user_id, org_id, lease_id, original_id, signed_by_tenant_at=T + HOUR)

    db.expire_all()
    assert (await signed_lease_attachment_repo.get_by_id(db, original_id)).signed_by_tenant_at is not None


@pytest.mark.asyncio
async def test_the_only_signature_on_a_generated_lease_cannot_be_cleared(db: AsyncSession) -> None:
    """Clearing it would unlock the lease and let Regenerate wipe the signed original."""
    user_id, org_id, _, lease, original = await lease_with_rendered_attachment(db)
    await _lease_fields(db, lease, user_id, org_id, status="generated")
    with patch(f"{SVC}.attach_presigned_urls_to_attachments", side_effect=lambda rows: rows):
        signed = await _set_signing(user_id, org_id, lease.id, original.id, signed_by_tenant_at=T)
        assert signed.is_locked is True

        with pytest.raises(LeaseAttachmentLockedError):
            await _set_signing(user_id, org_id, lease.id, original.id, signed_by_tenant_at=None)


@pytest.mark.asyncio
async def test_a_signature_can_be_added_to_a_locked_file(db: AsyncSession) -> None:
    user_id, org_id, lease_id, file_id = await _locked_lease_with_file(db, kind="signed_lease", offset=HOUR)
    with patch(f"{SVC}.attach_presigned_urls_to_attachments", side_effect=lambda rows: rows):
        added = await _set_signing(user_id, org_id, lease_id, file_id, signed_by_landlord_at=T)

    assert added.signed_by_landlord_at is not None
    assert added.is_locked is True


@pytest.mark.asyncio
async def test_the_signed_copy_then_sent_then_signed_flow_works_end_to_end(db: AsyncSession) -> None:
    """Generated and emailed, the host uploads the signed copy and moves the lease on."""
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    await _lease_fields(db, lease, user_id, org_id, last_emailed_to_tenant_at=T)
    ids = dict(user_id=user_id, organization_id=org_id, lease_id=lease.id)

    _, signed = await _attempt_upload(user_id, org_id, lease.id, "signed_lease")
    sent = await update_lease(**ids, notes=None, status="sent", values=None)
    done = await update_lease(**ids, notes=None, status="signed", values=None)

    assert (signed.kind, sent.status, done.status) == ("signed_lease", "sent", "signed")
    assert done.documents_locked is True
    with patch(f"{SVC}.attach_presigned_urls_to_attachments", side_effect=lambda rows: rows):
        files = {a.id: a.is_locked for a in await lease_attachment_service.list_attachments(**ids)}
    assert files[signed.id] is True
    with pytest.raises(LeaseAttachmentLockedError):
        await delete_attachment(**ids, attachment_id=signed.id)


@pytest.mark.asyncio
async def test_the_response_says_which_files_and_leases_are_locked(db: AsyncSession) -> None:
    user_id, org_id, lease_id, file_id = await _locked_lease_with_file(db, kind="signed_lease", offset=HOUR)
    ids = dict(user_id=user_id, organization_id=org_id, lease_id=lease_id)
    await db.execute(
        update(SignedLeaseAttachment)
        .where(SignedLeaseAttachment.lease_id == lease_id, SignedLeaseAttachment.id != file_id)
        .values(uploaded_at=T - HOUR),
    )
    await db.commit()
    await _file(db, lease_id, user_id, kind="signed_lease", at=T)

    detail = await get_lease(**ids)
    with patch(f"{SVC}.attach_presigned_urls_to_attachments", side_effect=lambda rows: rows):
        files = {a.id: a.is_locked for a in await lease_attachment_service.list_attachments(**ids)}

    assert detail.documents_locked is True
    assert files[file_id] is False
    assert list(files.values()).count(True) == 2  # the original and the first signed copy


@pytest.mark.asyncio
@pytest.mark.parametrize("fields", [{"status": "sent"}, {"status": "generated", "last_emailed_to_tenant_at": T}])
async def test_values_cannot_be_edited_once_the_lease_is_past_draft_or_emailed(db: AsyncSession, fields: dict) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    await _lease_fields(db, lease, user_id, org_id, **fields)

    with pytest.raises(CannotEditValuesError):
        await update_lease(
            user_id=user_id, organization_id=org_id, lease_id=lease.id, notes=None, status=None, values={"RENT": "1"},
        )


@pytest.mark.asyncio
async def test_values_cannot_be_edited_on_a_draft_that_holds_a_signed_copy(db: AsyncSession) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    await _lease_fields(db, lease, user_id, org_id, status="draft")
    await _file(db, lease.id, user_id, kind="signed_lease", at=T)

    with pytest.raises(CannotEditValuesError):
        await update_lease(
            user_id=user_id, organization_id=org_id, lease_id=lease.id, notes=None, status=None, values={"RENT": "1"},
        )
