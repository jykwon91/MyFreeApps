"""The lock check happens under the lease row lock, not just before rendering.

Each test lets a different session lock the lease while the documents are
being rendered. The write then refuses, nothing but the just-uploaded objects
is deleted, and the original documents stay.

Two branches of ``lock_lease_and_verify`` are covered, and each test fails if
its own branch is removed: the generate and re-pick tests need the
``rerenders_documents`` check, while the new-template test needs the
"locked since the read" check, because status alone does not change the
snapshot the write compares.
"""
from __future__ import annotations

import datetime as _dt
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.leases import signed_lease_repo
from app.services.leases import lease_render_service
from app.services.leases.exceptions.lease_changed_during_render_error import LeaseChangedDuringRenderError
from app.services.leases.exceptions.lease_documents_locked_error import LeaseDocumentsLockedError
from app.services.leases.lease_pdf_service import generate_lease
from tests.lease_regenerate_support import (
    OLD_KEY,
    PDF,
    deleted,
    lease_with_rendered_attachment,
    patches,
    real_uow,  # noqa: F401 — fixture
    regenerate,
    rendered_keys,
    second_template,
    storage_double,
)

LOCKING_FIELDS = [
    pytest.param({"status": "sent"}, id="sent"),
    pytest.param({"last_emailed_to_tenant_at": _dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc)}, id="emailed"),
]


class _LockDuringRender:
    """Runs once, right after the first real render has uploaded."""

    def __init__(self, real_uow, user_id, org_id, lease_id, fields) -> None:
        self._args = (real_uow, user_id, org_id, lease_id, fields)
        self._fired = False
        self._real = lease_render_service.render_and_upload

    async def __call__(self, *args, **kwargs):
        rendered = await self._real(*args, **kwargs)
        if not self._fired:
            self._fired = True
            real_uow, user_id, org_id, lease_id, fields = self._args
            async with real_uow() as other:
                await signed_lease_repo.update_lease(
                    other, lease_id=lease_id, user_id=user_id, organization_id=org_id, fields=fields,
                )
        return rendered


def _assert_only_new_objects_removed(storage) -> None:
    uploaded = [c.args[0] for c in storage.upload_file.call_args_list]
    assert uploaded and sorted(deleted(storage)) == sorted(uploaded)
    assert OLD_KEY not in deleted(storage)


@pytest.mark.asyncio
@pytest.mark.parametrize("fields", LOCKING_FIELDS)
async def test_generate_refuses_when_the_lease_is_locked_mid_render(
    db: AsyncSession, real_uow, fields: dict,
) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    lease_id = lease.id
    storage = storage_double()

    with patch(f"{PDF}.render_and_upload", _LockDuringRender(real_uow, user_id, org_id, lease_id, fields)):
        p = patches(storage)
        with p[0], p[1], p[2], p[3], pytest.raises(LeaseDocumentsLockedError):
            await generate_lease(
                user_id=user_id, organization_id=org_id, lease_id=lease_id, today=_dt.date(2026, 1, 1),
            )

    assert await rendered_keys(db, lease_id) == [OLD_KEY]
    db.expire_all()
    stored = await signed_lease_repo.get(db, lease_id=lease_id, user_id=user_id, organization_id=org_id)
    assert stored is not None and stored.status == fields.get("status", "generated")
    _assert_only_new_objects_removed(storage)


@pytest.mark.asyncio
@pytest.mark.parametrize("fields", LOCKING_FIELDS)
async def test_repick_refuses_when_the_lease_is_locked_mid_render(
    db: AsyncSession, real_uow, fields: dict,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    lease_id, template_id = lease.id, template.id
    storage = storage_double()

    with patch(f"{PDF}.render_and_upload", _LockDuringRender(real_uow, user_id, org_id, lease_id, fields)):
        with pytest.raises(LeaseDocumentsLockedError):
            await regenerate(storage, user_id, org_id, lease, [template_id])

    assert await rendered_keys(db, lease_id) == [OLD_KEY]
    db.expire_all()
    stored = await signed_lease_repo.get(db, lease_id=lease_id, user_id=user_id, organization_id=org_id)
    assert stored is not None and stored.status == fields.get("status", "generated")
    _assert_only_new_objects_removed(storage)


@pytest.mark.asyncio
async def test_adding_a_new_template_does_not_save_values_to_a_lease_locked_mid_render(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, _, lease, _ = await lease_with_rendered_attachment(db)
    extra = await second_template(db, user_id, org_id)
    lease_id, extra_id = lease.id, extra.id
    storage = storage_double()

    with patch(f"{PDF}.render_and_upload", _LockDuringRender(real_uow, user_id, org_id, lease_id, {"status": "sent"})):
        with pytest.raises(LeaseChangedDuringRenderError):
            await regenerate(storage, user_id, org_id, lease, [extra_id])

    assert await rendered_keys(db, lease_id) == [OLD_KEY]
    _assert_only_new_objects_removed(storage)
