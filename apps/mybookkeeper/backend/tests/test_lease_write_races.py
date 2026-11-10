"""Documents rendered from an unlocked read are written only if the lease is unchanged.

Each test changes the lease while its documents are being rendered (the
``render_and_upload`` wrapper runs the interfering request after the real
render). The write then finds the lease different from what was rendered, so
it raises ``LeaseChangedDuringRenderError`` and writes nothing; the guard
removes the objects that were just uploaded. SQLite has no row locks, so these
exercise the re-check, not the lock itself.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import patch

import pytest
from minio.error import S3Error
from sqlalchemy import update
from urllib3.exceptions import HTTPError, MaxRetryError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.lease_template import LeaseTemplate
from app.repositories.leases import signed_lease_repo, signed_lease_template_repo
from app.services.leases import lease_render_service
from app.services.leases.exceptions.lease_changed_during_render_error import (
    LeaseChangedDuringRenderError,
)
from app.services.leases.exceptions.template_storage_unavailable_error import (
    TemplateStorageUnavailableError,
)
from app.services.leases.lease_pdf_service import add_templates_and_generate, generate_lease
from app.services.leases.lease_template_service import TemplateNotFoundError
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
from tests.lease_template_upload_support import UnitOfWorkFactory


class _Interference:
    """Runs ``action`` once, right after the first real render has uploaded."""

    def __init__(self, action) -> None:
        self._action = action
        self._fired = False
        self._real = lease_render_service.render_and_upload

    async def __call__(self, *args, **kwargs):
        rendered = await self._real(*args, **kwargs)
        if not self._fired:
            self._fired = True
            await self._action()
        return rendered


async def _links(db: AsyncSession, lease_id: uuid.UUID) -> list[uuid.UUID]:
    db.expire_all()
    rows = await signed_lease_template_repo.list_for_lease(db, lease_id=lease_id)
    return sorted(r.template_id for r in rows)


@pytest.mark.asyncio
async def test_generate_racing_an_add_loses_nothing_and_asks_to_retry(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    extra = await second_template(db, user_id, org_id)
    lease_id, template_id, extra_id = lease.id, template.id, extra.id
    storage = storage_double()

    async def add_extra_meanwhile() -> None:
        await regenerate(storage, user_id, org_id, lease, [extra_id])

    with patch(f"{PDF}.render_and_upload", _Interference(add_extra_meanwhile)):
        p = patches(storage)
        with p[0], p[1], p[2], p[3], pytest.raises(LeaseChangedDuringRenderError):
            await generate_lease(
                user_id=user_id, organization_id=org_id, lease_id=lease_id, today=_dt.date(2026, 1, 1),
            )

    assert await _links(db, lease_id) == sorted([template_id, extra_id])
    # The add's rendered extra document survived; only the interrupted generate's uploads went.
    keys = await rendered_keys(db, lease_id)
    assert OLD_KEY in keys and len(keys) == 2
    generate_upload = storage.upload_file.call_args_list[0].args[0]
    assert generate_upload in deleted(storage) and generate_upload not in keys


@pytest.mark.asyncio
async def test_double_add_of_the_same_template_renders_it_once(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    extra = await second_template(db, user_id, org_id)
    lease_id, template_id, extra_id = lease.id, template.id, extra.id
    storage = storage_double()

    async def other_add() -> None:
        await regenerate(storage, user_id, org_id, lease, [extra_id])

    with patch(f"{PDF}.render_and_upload", _Interference(other_add)):
        with pytest.raises(LeaseChangedDuringRenderError):
            await regenerate(storage, user_id, org_id, lease, [extra_id])

    assert await _links(db, lease_id) == sorted([template_id, extra_id])
    assert len(await rendered_keys(db, lease_id)) == 2  # the old one plus one for the extra
    losing_upload = storage.upload_file.call_args_list[0].args[0]
    assert losing_upload in deleted(storage)


@pytest.mark.asyncio
async def test_values_edited_during_render_writes_nothing(
    db: AsyncSession, real_uow: UnitOfWorkFactory,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    lease_id, template_id = lease.id, template.id
    storage = storage_double()

    async def edit_values() -> None:
        async with real_uow() as other:
            await signed_lease_repo.update_lease(
                other, lease_id=lease_id, user_id=user_id, organization_id=org_id,
                fields={"values": {"TENANT FULL NAME": "Edited"}},
            )

    with patch(f"{PDF}.render_and_upload", _Interference(edit_values)):
        with pytest.raises(LeaseChangedDuringRenderError):
            await regenerate(storage, user_id, org_id, lease, [template_id])

    db.expire_all()
    stored = await signed_lease_repo.get(db, lease_id=lease_id, user_id=user_id, organization_id=org_id)
    assert stored is not None and stored.values == {"TENANT FULL NAME": "Edited"}
    assert await rendered_keys(db, lease_id) == [OLD_KEY]
    uploaded = [c.args[0] for c in storage.upload_file.call_args_list]
    assert uploaded and sorted(deleted(storage)) == sorted(uploaded)


@pytest.mark.asyncio
async def test_template_soft_deleted_during_render_is_not_linked(
    db: AsyncSession, real_uow: UnitOfWorkFactory,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    extra = await second_template(db, user_id, org_id)
    lease_id, template_id, extra_id = lease.id, template.id, extra.id
    storage = storage_double()

    async def soft_delete_extra() -> None:
        async with real_uow() as other:
            await other.execute(
                update(LeaseTemplate)
                .where(LeaseTemplate.id == extra_id)
                .values(deleted_at=_dt.datetime.now(_dt.timezone.utc)),
            )

    with patch(f"{PDF}.render_and_upload", _Interference(soft_delete_extra)):
        with pytest.raises(TemplateNotFoundError):
            await regenerate(storage, user_id, org_id, lease, [extra_id])

    assert await _links(db, lease_id) == [template_id]
    assert await rendered_keys(db, lease_id) == [OLD_KEY]
    uploaded = [c.args[0] for c in storage.upload_file.call_args_list]
    assert uploaded and sorted(deleted(storage)) == sorted(uploaded)


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["upload", "download", "connection"])
async def test_storage_outage_becomes_storage_unavailable_and_writes_nothing(
    db: AsyncSession, real_uow, failure: str,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    lease_id, template_id = lease.id, template.id
    storage = storage_double()
    if failure == "upload":
        storage.upload_file.side_effect = HTTPError("minio down")
    elif failure == "connection":
        storage.download_file.side_effect = MaxRetryError(None, "http://minio", None)  # type: ignore[arg-type]
    else:
        storage.download_file.side_effect = S3Error("_r", "InternalError", "boom", "", "", "")

    with pytest.raises(TemplateStorageUnavailableError):
        await regenerate(storage, user_id, org_id, lease, [template_id])

    assert await rendered_keys(db, lease_id) == [OLD_KEY]


@pytest.mark.asyncio
async def test_missing_template_object_is_still_reported_as_missing_not_unavailable(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    storage = storage_double(missing=True)

    with pytest.raises(StoredFileMissingError):
        await regenerate(storage, user_id, org_id, lease, [template.id])


@pytest.mark.asyncio
async def test_render_failure_with_an_os_error_is_not_reported_as_a_storage_outage(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    lease_id, template_id = lease.id, template.id
    storage = storage_double()
    p = patches(storage)

    with p[0], p[1], p[3], patch(
        f"{RENDER}.render_md", side_effect=FileNotFoundError("soffice wrote no PDF"),
    ):
        with pytest.raises(FileNotFoundError):
            await add_templates_and_generate(
                user_id=user_id, organization_id=org_id, lease_id=lease_id,
                template_ids=[template_id], today=_dt.date(2026, 1, 1),
            )

    assert await rendered_keys(db, lease_id) == [OLD_KEY]
