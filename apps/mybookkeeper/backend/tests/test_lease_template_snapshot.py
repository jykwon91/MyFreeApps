"""A rendered lease records the template name + version it was rendered from.

The snapshot is written with the rendered documents and does not follow a later
rename or file replacement (version bump) of the template.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.leases import lease_template_repo, signed_lease_repo, signed_lease_template_repo
from app.repositories.leases.signed_lease_template_link_missing_error import (
    SignedLeaseTemplateLinkMissingError,
)
from app.schemas.leases.signed_lease_response import SignedLeaseResponse
from app.services.leases.exceptions.lease_changed_during_render_error import (
    LeaseChangedDuringRenderError,
)
from app.services.leases.exceptions.lease_documents_locked_error import LeaseDocumentsLockedError
from app.services.leases.lease_lifecycle_service import get_lease
from app.services.leases.lease_pdf_service import generate_lease
from app.services.leases.lease_render_service import render_and_upload
from tests.lease_regenerate_support import (
    PDF,
    lease_with_rendered_attachment,
    patches,
    real_uow,  # noqa: F401 — fixture
    regenerate,
    second_template,
    storage_double,
)
from tests.lease_template_upload_support import UnitOfWorkFactory

TODAY = _dt.date(2026, 1, 1)


async def _generate(storage, user_id: uuid.UUID, org_id: uuid.UUID, lease_id: uuid.UUID) -> SignedLeaseResponse:
    p = patches(storage)
    with p[0], p[1], p[2], p[3]:
        detail, _ = await generate_lease(user_id=user_id, organization_id=org_id, lease_id=lease_id, today=TODAY)
    return detail


async def _bump(db: AsyncSession, template_id: uuid.UUID, user_id: uuid.UUID, org_id: uuid.UUID) -> None:
    await lease_template_repo.bump_version(db, template_id=template_id, user_id=user_id, organization_id=org_id)
    await db.commit()


async def _rename(db: AsyncSession, template_id: uuid.UUID, user_id: uuid.UUID, org_id: uuid.UUID, name: str) -> None:
    await lease_template_repo.update_metadata(
        db, template_id=template_id, user_id=user_id, organization_id=org_id, name=name,
    )
    await db.commit()


async def _send(db: AsyncSession, lease_id: uuid.UUID, user_id: uuid.UUID, org_id: uuid.UUID) -> None:
    await signed_lease_repo.update_lease(
        db, lease_id=lease_id, user_id=user_id, organization_id=org_id, fields={"status": "sent"},
    )
    await db.commit()


async def _snapshots(db: AsyncSession, lease_id: uuid.UUID) -> dict[uuid.UUID, tuple[str | None, int | None]]:
    db.expire_all()
    rows = await signed_lease_template_repo.list_for_lease(db, lease_id=lease_id)
    return {r.template_id: (r.template_name_snapshot, r.template_version_snapshot) for r in rows}


@pytest.mark.asyncio
async def test_generate_records_name_and_version_and_later_edits_do_not_change_it(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    await _bump(db, template.id, user_id, org_id)

    detail = await _generate(storage_double(), user_id, org_id, lease.id)
    [link] = detail.templates
    assert (link.template_name_snapshot, link.template_version_snapshot) == ("T", 2)

    await lease_template_repo.update_metadata(
        db, template_id=template.id, user_id=user_id, organization_id=org_id, name="Renamed",
    )
    await _bump(db, template.id, user_id, org_id)

    [after] = (await get_lease(user_id=user_id, organization_id=org_id, lease_id=lease.id)).templates
    assert (after.name, after.version) == ("Renamed", 3)
    assert (after.template_name_snapshot, after.template_version_snapshot) == ("T", 2)


@pytest.mark.asyncio
async def test_adding_a_template_records_only_the_newly_rendered_one(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    addendum = await second_template(db, user_id, org_id)
    await _bump(db, addendum.id, user_id, org_id)

    result = await regenerate(storage_double(), user_id, org_id, lease, [addendum.id])

    snapshots = {t.id: (t.template_name_snapshot, t.template_version_snapshot) for t in result.templates}
    assert snapshots == {template.id: (None, None), addendum.id: ("Addendum", 2)}


@pytest.mark.asyncio
async def test_regenerating_an_existing_template_refreshes_its_snapshot(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    await _generate(storage_double(), user_id, org_id, lease.id)
    await lease_template_repo.update_metadata(
        db, template_id=template.id, user_id=user_id, organization_id=org_id, name="Master",
    )
    await _bump(db, template.id, user_id, org_id)

    result = await regenerate(storage_double(), user_id, org_id, lease, [template.id])

    [link] = result.templates
    assert (link.template_name_snapshot, link.template_version_snapshot) == ("Master", 2)


@pytest.mark.asyncio
async def test_template_replaced_while_rendering_abandons_the_write(
    db: AsyncSession, real_uow: UnitOfWorkFactory,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    template_id, lease_id = template.id, lease.id

    async def replace_mid_render(*args, **kwargs):
        rendered = await render_and_upload(*args, **kwargs)
        async with real_uow() as other:
            await lease_template_repo.bump_version(
                other, template_id=template_id, user_id=user_id, organization_id=org_id,
            )
        return rendered

    with patch(f"{PDF}.render_and_upload", side_effect=replace_mid_render):
        with pytest.raises(LeaseChangedDuringRenderError):
            await _generate(storage_double(), user_id, org_id, lease_id)

    db.expire_all()
    [row] = await signed_lease_template_repo.list_for_lease(db, lease_id=lease_id)
    assert row.template_version_snapshot is None


@pytest.mark.asyncio
async def test_rename_during_a_regenerate_records_the_name_the_documents_were_rendered_under(
    db: AsyncSession, real_uow: UnitOfWorkFactory,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    template_id, lease_id = template.id, lease.id

    async def rename_mid_render(*args, **kwargs):
        rendered = await render_and_upload(*args, **kwargs)
        async with real_uow() as other:
            await lease_template_repo.update_metadata(
                other, template_id=template_id, user_id=user_id, organization_id=org_id, name="Renamed mid-render",
            )
        return rendered

    with patch(f"{PDF}.render_and_upload", side_effect=rename_mid_render):
        detail = await _generate(storage_double(), user_id, org_id, lease_id)

    [link] = detail.templates
    assert link.name == "Renamed mid-render"
    assert (link.template_name_snapshot, link.template_version_snapshot) == ("T", 1)


@pytest.mark.asyncio
async def test_regenerating_a_sent_lease_is_refused_and_keeps_its_snapshots(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    template_id, lease_id = template.id, lease.id
    await _generate(storage_double(), user_id, org_id, lease_id)
    await _send(db, lease_id, user_id, org_id)
    await _rename(db, template_id, user_id, org_id, "Master")
    await _bump(db, template_id, user_id, org_id)

    with pytest.raises(LeaseDocumentsLockedError):
        await _generate(storage_double(), user_id, org_id, lease_id)
    with pytest.raises(LeaseDocumentsLockedError):
        await regenerate(storage_double(), user_id, org_id, lease, [template_id])

    assert await _snapshots(db, lease_id) == {template_id: ("T", 1)}


@pytest.mark.asyncio
async def test_adding_a_template_to_a_sent_lease_stamps_only_the_new_link(
    db: AsyncSession, real_uow,
) -> None:
    user_id, org_id, template, lease, _ = await lease_with_rendered_attachment(db)
    template_id, lease_id = template.id, lease.id
    await _generate(storage_double(), user_id, org_id, lease_id)
    addendum = await second_template(db, user_id, org_id)
    addendum_id = addendum.id
    await _send(db, lease_id, user_id, org_id)
    await _rename(db, template_id, user_id, org_id, "Master")
    await _bump(db, template_id, user_id, org_id)

    await regenerate(storage_double(), user_id, org_id, lease, [addendum_id])

    assert await _snapshots(db, lease_id) == {template_id: ("T", 1), addendum_id: ("Addendum", 1)}


@pytest.mark.asyncio
async def test_stamping_a_link_that_does_not_exist_fails_loudly(db: AsyncSession) -> None:
    with pytest.raises(SignedLeaseTemplateLinkMissingError):
        await signed_lease_template_repo.record_render_snapshot(
            db, lease_id=uuid.uuid4(), template_id=uuid.uuid4(), template_name="T", template_version=1,
        )


@pytest.mark.asyncio
async def test_a_version_bump_moves_updated_at(db: AsyncSession) -> None:
    """The snapshot backfill relies on every version bump advancing ``updated_at``."""
    user_id, org_id = uuid.uuid4(), uuid.uuid4()
    template = await lease_template_repo.create(db, user_id=user_id, organization_id=org_id, name="T")
    await db.commit()
    template_id, before = template.id, template.updated_at

    await _bump(db, template_id, user_id, org_id)

    db.expire_all()
    bumped = await lease_template_repo.get(db, template_id=template_id, user_id=user_id, organization_id=org_id)
    assert bumped is not None and bumped.version == 2
    assert bumped.updated_at.replace(tzinfo=None) > before.replace(tzinfo=None)
