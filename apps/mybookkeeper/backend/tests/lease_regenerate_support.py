"""Shared fixtures and helpers for the lease render/regenerate tests."""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from minio.error import S3Error
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_repo,
    signed_lease_attachment_repo,
    signed_lease_repo,
    signed_lease_template_repo,
)
from app.services.leases.lease_pdf_service import add_templates_and_generate
from tests.lease_template_upload_support import UnitOfWorkFactory

PDF = "app.services.leases.lease_pdf_service"
LIFECYCLE = "app.services.leases.lease_lifecycle_service"
RENDER = "app.services.leases.lease_render_service"
CLEANUP = "app.services.storage.stored_file_cleanup"
OLD_KEY = "signed-leases/lease/old-rendered"


@pytest_asyncio.fixture
async def real_uow(_db_engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[UnitOfWorkFactory]:
    maker = async_sessionmaker(_db_engine, expire_on_commit=False)

    @asynccontextmanager
    async def uow() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            async with session.begin():
                yield session

    for target in (PDF, LIFECYCLE, RENDER):
        monkeypatch.setattr(f"{target}.unit_of_work", uow)
    yield uow


def storage_double(*, missing: bool = False) -> MagicMock:
    storage = MagicMock()
    storage.download_file.return_value = b"# Hello"
    storage.delete_files.return_value = []
    if missing:
        storage.download_file.side_effect = S3Error("_response", "NoSuchKey", "gone", "", "", "")
    return storage


async def lease_with_rendered_attachment(db: AsyncSession):
    user_id, org_id = uuid.uuid4(), uuid.uuid4()
    template = await lease_template_repo.create(db, user_id=user_id, organization_id=org_id, name="T")
    await lease_template_file_repo.create(
        db,
        template_id=template.id,
        filename="lease.md",
        storage_key=f"lease-templates/{template.id}/f1",
        content_type="text/markdown",
        size_bytes=7,
        display_order=0,
    )
    lease = await signed_lease_repo.create(
        db,
        user_id=user_id,
        organization_id=org_id,
        applicant_id=uuid.uuid4(),
        listing_id=None,
        values={},
        starts_on=None,
        ends_on=None,
        status="generated",
        kind="generated",
    )
    await signed_lease_template_repo.create(db, lease_id=lease.id, template_id=template.id, display_order=0)
    old = await signed_lease_attachment_repo.create(
        db,
        lease_id=lease.id,
        storage_key=OLD_KEY,
        filename="lease.pdf",
        content_type="application/pdf",
        size_bytes=10,
        kind="rendered_original",
        uploaded_by_user_id=user_id,
        uploaded_at=_dt.datetime.now(_dt.timezone.utc),
    )
    await db.commit()
    return user_id, org_id, template, lease, old


def patches(storage: MagicMock):
    return (
        patch(f"{PDF}.get_storage", return_value=storage),
        patch(f"{CLEANUP}.get_storage", return_value=storage),
        patch(f"{RENDER}.render_md", return_value="# Hello"),
        patch(f"{RENDER}.render_md_text_to_pdf_or_keep", return_value=b"%PDF new"),
    )


async def regenerate(storage, user_id, org_id, lease, template_ids):
    p = patches(storage)
    with p[0], p[1], p[2], p[3]:
        return await add_templates_and_generate(
            user_id=user_id,
            organization_id=org_id,
            lease_id=lease.id,
            template_ids=template_ids,
            today=_dt.date(2026, 1, 1),
        )


def deleted(storage: MagicMock) -> list[str]:
    return [k for c in storage.delete_files.call_args_list for k in c.args[0]]


async def rendered_keys(db: AsyncSession, lease_id: uuid.UUID) -> list[str]:
    db.expire_all()
    rows = await signed_lease_attachment_repo.list_by_lease(db, lease_id)
    return sorted(a.storage_key for a in rows if a.kind == "rendered_original")


async def second_template(db: AsyncSession, user_id, org_id):
    template = await lease_template_repo.create(db, user_id=user_id, organization_id=org_id, name="Addendum")
    await lease_template_file_repo.create(
        db,
        template_id=template.id,
        filename="addendum.md",
        storage_key=f"lease-templates/{template.id}/a1",
        content_type="text/markdown",
        size_bytes=7,
        display_order=0,
    )
    await db.commit()
    return template
