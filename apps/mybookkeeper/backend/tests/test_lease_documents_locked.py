"""A sent or signed lease keeps the documents it was generated with.

Re-picking an already-linked template, or calling generate, would replace the
``rendered_original`` attachments with a render of whatever the template
currently holds. Both are refused once the lease leaves draft/generated;
adding a brand-new template still renders only that template's files.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.lease_enums import LEASE_DOCUMENT_RERENDER_STATUSES, SIGNED_LEASE_STATUSES
from app.repositories.leases import lease_template_file_repo, signed_lease_attachment_repo, signed_lease_repo
from app.services.leases.exceptions.lease_documents_locked_error import LeaseDocumentsLockedError
from app.services.leases.exceptions.lease_attachment_locked_error import LeaseAttachmentLockedError
from app.services.leases.lease_attachment_service import delete_attachment, update_attachment_kind
from app.services.leases.lease_pdf_service import add_templates_and_generate, generate_lease
from app.services.leases.lease_prefill_service import prefill_addendum_placeholders
from tests.lease_regenerate_support import (
    OLD_KEY,
    PDF,
    lease_with_rendered_attachment,
    patches,
    real_uow,  # noqa: F401 — fixture
    regenerate,
    rendered_keys,
    second_template,
    storage_double,
)

LOCKED_STATUSES = [s for s in SIGNED_LEASE_STATUSES if s not in LEASE_DOCUMENT_RERENDER_STATUSES]


async def _set_status(db: AsyncSession, lease, user_id, org_id, status: str) -> None:
    await signed_lease_repo.update_lease(
        db, lease_id=lease.id, user_id=user_id, organization_id=org_id, fields={"status": status},
    )
    await db.commit()


async def _mark_emailed(db: AsyncSession, lease, user_id, org_id) -> None:
    await signed_lease_repo.update_lease(
        db,
        lease_id=lease.id,
        user_id=user_id,
        organization_id=org_id,
        fields={"last_emailed_to_tenant_at": _dt.datetime.now(_dt.timezone.utc)},
    )
    await db.commit()


async def _replace_template_file(db: AsyncSession, template_id: uuid.UUID) -> None:
    await lease_template_file_repo.create(
        db,
        template_id=template_id,
        filename="replaced.md",
        storage_key=f"lease-templates/{template_id}/replaced",
        content_type="text/markdown",
        size_bytes=7,
        display_order=1,
    )
    await db.commit()


def test_locked_statuses_are_everything_from_sent_onward() -> None:
    assert LOCKED_STATUSES == ["sent", "signed", "active", "ended", "terminated"]


@pytest.mark.asyncio
@pytest.mark.parametrize("status", LOCKED_STATUSES)
async def test_repicking_a_linked_template_is_refused_and_documents_unchanged(
    db: AsyncSession, real_uow, status: str,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    await _replace_template_file(db, template.id)
    await _set_status(db, lease, user_id, org_id, status)
    storage = storage_double()

    with pytest.raises(LeaseDocumentsLockedError):
        await regenerate(storage, user_id, org_id, lease, [template.id])

    assert await rendered_keys(db, lease.id) == [OLD_KEY]
    storage.upload_file.assert_not_called()
    storage.delete_files.assert_not_called()


@pytest.mark.asyncio
async def test_generate_on_a_signed_lease_is_refused(db: AsyncSession, real_uow) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    lease_id = lease.id
    await _set_status(db, lease, user_id, org_id, "signed")
    storage = storage_double()

    p = patches(storage)
    with p[0], p[1], p[2], p[3], pytest.raises(LeaseDocumentsLockedError):
        await generate_lease(
            user_id=user_id, organization_id=org_id, lease_id=lease_id, today=_dt.date(2026, 1, 1),
        )

    assert await rendered_keys(db, lease_id) == [OLD_KEY]
    db.expire_all()
    stored = await signed_lease_repo.get(db, lease_id=lease_id, user_id=user_id, organization_id=org_id)
    assert stored is not None and stored.status == "signed"
    storage.upload_file.assert_not_called()


@pytest.mark.asyncio
async def test_repicking_on_a_generated_lease_still_rerenders(db: AsyncSession, real_uow) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    storage = storage_double()

    await regenerate(storage, user_id, org_id, lease, [template.id])

    keys = await rendered_keys(db, lease.id)
    assert OLD_KEY not in keys and len(keys) == 1
    storage.upload_file.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["sent", "signed"])
async def test_adding_a_new_template_to_a_locked_lease_keeps_existing_documents(
    db: AsyncSession, real_uow, status: str,
) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    extra = await second_template(db, user_id, org_id)
    lease_id, extra_id = lease.id, extra.id
    await _set_status(db, lease, user_id, org_id, status)
    storage = storage_double()

    result = await regenerate(storage, user_id, org_id, lease, [extra_id])

    keys = await rendered_keys(db, lease_id)
    assert OLD_KEY in keys and len(keys) == 2
    assert {t.id for t in result.templates} >= {extra_id}
    storage.upload_file.assert_called_once()
    storage.delete_files.assert_not_called()


@pytest.mark.asyncio
async def test_a_generated_lease_already_emailed_to_the_tenant_is_locked(db: AsyncSession, real_uow) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    lease_id, template_id = lease.id, template.id
    await _mark_emailed(db, lease, user_id, org_id)
    storage = storage_double()

    with pytest.raises(LeaseDocumentsLockedError):
        await regenerate(storage, user_id, org_id, lease, [template_id])
    p = patches(storage)
    with p[0], p[1], p[2], p[3], pytest.raises(LeaseDocumentsLockedError):
        await generate_lease(
            user_id=user_id, organization_id=org_id, lease_id=lease_id, today=_dt.date(2026, 1, 1),
        )

    assert await rendered_keys(db, lease_id) == [OLD_KEY]
    storage.upload_file.assert_not_called()


@pytest.mark.asyncio
async def test_a_signed_lease_prefill_marks_saved_values_read_only(db: AsyncSession, real_uow, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.leases.lease_prefill_service.unit_of_work", real_uow)
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    from app.repositories.leases import lease_template_placeholder_repo

    await lease_template_placeholder_repo.create(
        db, template_id=template.id, key="TENANT FULL NAME", display_label="Tenant", input_type="text",
        required=True, default_source=None, computed_expr=None, display_order=0,
    )
    lease_id, template_id = lease.id, template.id
    await signed_lease_repo.update_lease(
        db, lease_id=lease_id, user_id=user_id, organization_id=org_id,
        fields={"status": "signed", "values": {"TENANT FULL NAME": "Real"}},
    )
    await db.commit()

    result = await prefill_addendum_placeholders(
        user_id=user_id, organization_id=org_id, lease_id=lease_id, template_ids=[template_id],
        today=_dt.date(2026, 1, 1),
    )

    assert [(i.key, i.is_read_only) for i in result.items] == [("TENANT FULL NAME", True)]


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["sent", "signed"])
async def test_record_files_of_a_locked_lease_cannot_be_deleted_or_relabelled(
    db: AsyncSession, real_uow, monkeypatch: pytest.MonkeyPatch, status: str,
) -> None:
    monkeypatch.setattr("app.services.leases.lease_attachment_service.unit_of_work", real_uow)
    user_id, org_id, _, lease, old = await lease_with_rendered_attachment(db)
    lease_id, old_id = lease.id, old.id
    other = await signed_lease_attachment_repo.create(
        db, lease_id=lease_id, storage_key="signed-leases/lease/other", filename="photo.pdf",
        content_type="application/pdf", size_bytes=1, kind="other", uploaded_by_user_id=user_id,
        uploaded_at=_dt.datetime.now(_dt.timezone.utc),
    )
    other_id = other.id
    await _set_status(db, lease, user_id, org_id, status)
    scope = {"user_id": user_id, "organization_id": org_id, "lease_id": lease_id}

    with pytest.raises(LeaseAttachmentLockedError):
        await delete_attachment(**scope, attachment_id=old_id)
    with pytest.raises(LeaseAttachmentLockedError):
        await update_attachment_kind(**scope, attachment_id=old_id, kind="other")
    with pytest.raises(LeaseAttachmentLockedError):
        await update_attachment_kind(**scope, attachment_id=other_id, kind="rendered_original")

    relabelled = await update_attachment_kind(**scope, attachment_id=other_id, kind="notice")
    assert relabelled.kind == "notice"
    await delete_attachment(**scope, attachment_id=other_id)
    assert await rendered_keys(db, lease_id) == [OLD_KEY]


@pytest.mark.asyncio
async def test_record_files_of_a_generated_lease_can_still_be_deleted(db: AsyncSession, real_uow, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.leases.lease_attachment_service.unit_of_work", real_uow)
    user_id, org_id, _, lease, old = await lease_with_rendered_attachment(db)
    lease_id = lease.id

    await delete_attachment(user_id=user_id, organization_id=org_id, lease_id=lease_id, attachment_id=old.id)

    assert await rendered_keys(db, lease_id) == []
