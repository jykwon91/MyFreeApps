"""A tenant email locks exactly the files it sent.

The lease-wide ``last_emailed_to_tenant_at`` is also set by an extension
addendum email, which never carries the lease's own files, so it can't be what
keeps a file locked. Each file records whether it went out.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import as_utc
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.repositories.leases import signed_lease_attachment_repo, signed_lease_repo
from app.services.leases import lease_attachment_service, lease_email_service
from app.services.leases.exceptions.lease_attachment_locked_error import LeaseAttachmentLockedError
from app.services.leases.lease_attachment_service import delete_attachment
from app.services.leases.lease_documents_lock import is_record_file_locked
from tests.lease_email_support import EMAIL, email_patches
from tests.lease_regenerate_support import (
    lease_with_rendered_attachment,
    real_uow,  # noqa: F401 — fixture
    storage_double,
)

SVC = "app.services.leases.lease_attachment_service"
T = _dt.datetime(2026, 3, 1, 12, tzinfo=_dt.timezone.utc)
HOUR = _dt.timedelta(hours=1)


@pytest.fixture(autouse=True)
def _own_transactions(real_uow, monkeypatch: pytest.MonkeyPatch) -> None:  # noqa: F811
    monkeypatch.setattr(f"{SVC}.unit_of_work", real_uow)
    monkeypatch.setattr(f"{EMAIL}.unit_of_work", real_uow)


async def _file(db: AsyncSession, lease_id: uuid.UUID, user_id: uuid.UUID, *, kind: str, at: _dt.datetime) -> uuid.UUID:
    row = await signed_lease_attachment_repo.create(
        db, lease_id=lease_id, storage_key=f"signed-leases/x/{kind}-{at.isoformat()}", filename=f"{kind}.pdf",
        content_type="application/pdf", size_bytes=1, kind=kind, uploaded_by_user_id=user_id, uploaded_at=at,
    )
    await db.commit()
    return row.id


async def _signed_lease_with_a_mistaken_copy(db: AsyncSession):
    """Signed at T: the original, the real signed copy at T+1h, a mistaken one at T+2h."""
    user_id, org_id, _, lease, original = await lease_with_rendered_attachment(db)
    await db.execute(
        update(SignedLeaseAttachment).where(SignedLeaseAttachment.id == original.id).values(uploaded_at=T - HOUR),
    )
    await signed_lease_repo.update_lease(
        db, lease_id=lease.id, user_id=user_id, organization_id=org_id,
        fields={"status": "signed", "signed_at": T},
    )
    await db.commit()
    real = await _file(db, lease.id, user_id, kind="signed_lease", at=T + HOUR)
    mistaken = await _file(db, lease.id, user_id, kind="signed_lease", at=T + 2 * HOUR)
    return user_id, org_id, lease.id, original.id, real, mistaken


async def _stamps(db: AsyncSession, lease_id: uuid.UUID) -> dict[uuid.UUID, _dt.datetime | None]:
    db.expire_all()
    return {
        a.id: a.emailed_to_tenant_at and as_utc(a.emailed_to_tenant_at)
        for a in await signed_lease_attachment_repo.list_by_lease(db, lease_id)
    }


async def _locks(user_id, org_id, lease_id) -> dict[uuid.UUID, bool]:
    with patch(f"{SVC}.attach_presigned_urls_to_attachments", side_effect=lambda rows: rows):
        files = await lease_attachment_service.list_attachments(
            user_id=user_id, organization_id=org_id, lease_id=lease_id,
        )
    return {a.id: a.is_locked for a in files}


@pytest.mark.asyncio
async def test_an_addendum_email_does_not_lock_an_earlier_mistaken_signed_copy(db: AsyncSession) -> None:
    user_id, org_id, lease_id, _, real, mistaken = await _signed_lease_with_a_mistaken_copy(db)
    addendum = await _file(db, lease_id, user_id, kind="signed_addendum", at=T + 3 * HOUR)
    send = MagicMock(return_value=True)
    p = email_patches(storage_double(), send)

    with p[0], p[1], p[2], p[3], p[4], p[5]:
        assert await lease_email_service.send_extension_addendum_to_tenant(
            lease_id=lease_id, addendum_attachment_id=addendum, user_id=user_id, organization_id=org_id,
        ) is True

    stamps = await _stamps(db, lease_id)
    assert stamps[addendum] is not None
    assert stamps[mistaken] is None and stamps[real] is None
    assert (await signed_lease_repo.get(
        db, lease_id=lease_id, user_id=user_id, organization_id=org_id,
    )).last_emailed_to_tenant_at is not None
    locks = await _locks(user_id, org_id, lease_id)
    assert (locks[real], locks[mistaken]) == (True, False)
    with patch(f"{SVC}.get_storage", return_value=MagicMock()):
        await delete_attachment(user_id=user_id, organization_id=org_id, lease_id=lease_id, attachment_id=mistaken)
    assert mistaken not in await _stamps(db, lease_id)


@pytest.mark.asyncio
async def test_the_documents_email_locks_exactly_the_files_it_sent(db: AsyncSession) -> None:
    user_id, org_id, lease_id, original, real, mistaken = await _signed_lease_with_a_mistaken_copy(db)
    inspection = await _file(db, lease_id, user_id, kind="move_in_inspection", at=T + HOUR)
    assert (await _locks(user_id, org_id, lease_id))[mistaken] is False
    send = MagicMock(return_value=True)
    p = email_patches(storage_double(), send)

    with p[0], p[1], p[2], p[3], p[4], p[5]:
        assert await lease_email_service.send_lease_to_tenant(
            lease_id=lease_id, user_id=user_id, organization_id=org_id,
        ) is True

    stamps = await _stamps(db, lease_id)
    assert all(stamps[i] is not None for i in (original, real, mistaken))
    assert stamps[inspection] is None
    assert len(send.call_args.kwargs["attachments"]) == 3
    assert (await _locks(user_id, org_id, lease_id))[mistaken] is True
    with pytest.raises(LeaseAttachmentLockedError):
        await delete_attachment(user_id=user_id, organization_id=org_id, lease_id=lease_id, attachment_id=mistaken)


@pytest.mark.asyncio
async def test_a_failed_fetch_puts_every_files_stamp_back(db: AsyncSession) -> None:
    user_id, org_id, lease_id, original, real, mistaken = await _signed_lease_with_a_mistaken_copy(db)
    earlier = T + 90 * _dt.timedelta(minutes=1)
    await signed_lease_attachment_repo.set_emailed_to_tenant_at(
        db, lease_id=lease_id, stamps={original: earlier, real: earlier},
    )
    await signed_lease_repo.update_lease(
        db, lease_id=lease_id, user_id=user_id, organization_id=org_id,
        fields={"last_emailed_to_tenant_at": earlier},
    )
    await db.commit()
    storage = storage_double()
    storage.download_file.side_effect = [b"ok", RuntimeError("storage down")]
    send = MagicMock(return_value=True)
    p = email_patches(storage, send)

    with p[0], p[1], p[2], p[3], p[4], p[5]:
        assert await lease_email_service.send_lease_to_tenant(
            lease_id=lease_id, user_id=user_id, organization_id=org_id,
        ) is False

    send.assert_not_called()
    stamps = await _stamps(db, lease_id)
    assert (stamps[original], stamps[real], stamps[mistaken]) == (earlier, earlier, None)
    assert as_utc((await signed_lease_repo.get(
        db, lease_id=lease_id, user_id=user_id, organization_id=org_id,
    )).last_emailed_to_tenant_at) == earlier
    assert (await _locks(user_id, org_id, lease_id))[mistaken] is False


@pytest.mark.asyncio
async def test_a_failed_fetch_leaves_a_later_emails_stamps_alone(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A stamps, then its fetch fails; B stamps and sends before A puts its stamps back."""
    user_id, org_id, lease_id, original, real, mistaken = await _signed_lease_with_a_mistaken_copy(db)
    args = dict(lease_id=lease_id, user_id=user_id, organization_id=org_id)
    storage = storage_double()
    storage.download_file.side_effect = [RuntimeError("storage down"), b"ok", b"ok", b"ok"]
    send = MagicMock(return_value=True)
    real_restore = lease_email_service.restore_email_stamps
    second: list[bool] = []

    async def b_sends_first(restore_db: AsyncSession, **kwargs: object) -> None:
        second.append(await lease_email_service.send_lease_to_tenant(**args))
        await real_restore(restore_db, **kwargs)

    monkeypatch.setattr(f"{EMAIL}.restore_email_stamps", b_sends_first)
    p = email_patches(storage, send)

    with p[0], p[1], p[2], p[3], p[4], p[5]:
        assert await lease_email_service.send_lease_to_tenant(**args) is False

    assert second == [True]
    send.assert_called_once()
    db.expire_all()
    b_stamp = as_utc((await signed_lease_repo.get(
        db, lease_id=lease_id, user_id=user_id, organization_id=org_id,
    )).last_emailed_to_tenant_at)
    stamps = await _stamps(db, lease_id)
    assert all(stamps[i] == b_stamp for i in (original, real, mistaken))
    assert (await _locks(user_id, org_id, lease_id))[mistaken] is True


@pytest.mark.asyncio
async def test_a_restore_that_fails_still_records_the_skip_and_raises(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id, org_id, lease_id, original, real, mistaken = await _signed_lease_with_a_mistaken_copy(db)
    storage = storage_double()
    storage.download_file.side_effect = RuntimeError("storage down")

    async def restore_fails(*_a: object, **_k: object) -> None:
        raise RuntimeError("database down")

    monkeypatch.setattr(f"{EMAIL}.restore_email_stamps", restore_fails)
    p = email_patches(storage, MagicMock(return_value=True))

    with p[0], p[1], p[2], p[3], p[4], p[5] as recorded, pytest.raises(RuntimeError, match="database down"):
        await lease_email_service.send_lease_to_tenant(lease_id=lease_id, user_id=user_id, organization_id=org_id)

    assert recorded.await_args.args[1] == "lease_email_skipped"
    assert recorded.await_args.args[4]["reason"] == "attachment_fetch_failed"
    stamps = await _stamps(db, lease_id)
    assert all(stamps[i] is not None for i in (original, real, mistaken))


def _lease(**fields: object) -> SimpleNamespace:
    base = dict(status="generated", sent_at=None, signed_at=None, last_emailed_to_tenant_at=T)
    return SimpleNamespace(**{**base, **fields})


def _original(emailed_at: _dt.datetime | None) -> SimpleNamespace:
    return SimpleNamespace(
        kind="rendered_original", uploaded_at=T - HOUR, signed_by_tenant_at=None, emailed_to_tenant_at=emailed_at,
    )


def test_a_generated_lease_locked_only_by_its_email_locks_the_emailed_files() -> None:
    emailed, not_emailed = _original(T), _original(None)
    lease = _lease()
    assert is_record_file_locked(lease, [emailed, not_emailed], emailed) is True
    assert is_record_file_locked(lease, [emailed, not_emailed], not_emailed) is False


def test_a_lease_past_generated_with_no_moment_locks_every_record_file() -> None:
    file = _original(None)
    assert is_record_file_locked(_lease(status="sent", last_emailed_to_tenant_at=None), [file], file) is True
