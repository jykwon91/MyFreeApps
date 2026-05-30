"""Service-layer tests for welcome_manual_section_image_service.

Uses the autouse in-memory storage fake (conftest ``_patch_storage_for_tests``)
plus a patched ``unit_of_work`` pointing at the SQLite test session.
"""
from __future__ import annotations

import io
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.welcome_manuals import (
    welcome_manual_repo,
    welcome_manual_section_image_repo,
    welcome_manual_section_repo,
)
from app.services.welcome_manuals import (
    welcome_manual_section_image_service,
    welcome_manual_service,
)


def _jpeg_bytes(color: tuple[int, int, int] = (10, 20, 30)) -> bytes:
    img = Image.new("RGB", (16, 16), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _patch_uow(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db

    return patch(
        "app.services.welcome_manuals.welcome_manual_section_image_service.unit_of_work",
        _fake,
    )


async def _make_section(db: AsyncSession, org: Organization, user: User):
    manual = await welcome_manual_repo.create_manual(
        db, organization_id=org.id, user_id=user.id,
        property_id=None, title="G", intro_text=None,
    )
    await db.flush()
    section = await welcome_manual_section_repo.create(
        db, manual_id=manual.id, title="Wi-Fi", body=None, display_order=0,
    )
    await db.flush()
    return manual, section


class TestUpload:
    @pytest.mark.asyncio
    async def test_appends_images_with_presigned_urls(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, section = await _make_section(db, test_org, test_user)
        await db.commit()
        files = [
            (_jpeg_bytes((1, 2, 3)), "router.jpg", "image/jpeg"),
            (_jpeg_bytes((4, 5, 6)), "bins.jpg", "image/jpeg"),
        ]
        with _patch_uow(db):
            result = await welcome_manual_section_image_service.upload_images(
                test_org.id, test_user.id, manual.id, section.id, files,
            )
        assert [r.display_order for r in result] == [0, 1]
        assert all(r.presigned_url and r.presigned_url.startswith("https://signed/") for r in result)
        assert all(r.is_available for r in result)

    @pytest.mark.asyncio
    async def test_manual_not_found(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_image_service.ManualNotFoundError):
                await welcome_manual_section_image_service.upload_images(
                    test_org.id, test_user.id, uuid.uuid4(), uuid.uuid4(),
                    [(_jpeg_bytes(), "a.jpg", "image/jpeg")],
                )

    @pytest.mark.asyncio
    async def test_section_not_found(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, _section = await _make_section(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_image_service.SectionNotFoundError):
                await welcome_manual_section_image_service.upload_images(
                    test_org.id, test_user.id, manual.id, uuid.uuid4(),
                    [(_jpeg_bytes(), "a.jpg", "image/jpeg")],
                )

    @pytest.mark.asyncio
    async def test_cross_org_manual_not_found(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, section = await _make_section(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_image_service.ManualNotFoundError):
                await welcome_manual_section_image_service.upload_images(
                    uuid.uuid4(), test_user.id, manual.id, section.id,
                    [(_jpeg_bytes(), "a.jpg", "image/jpeg")],
                )

    @pytest.mark.asyncio
    async def test_rejects_non_image(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, section = await _make_section(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_image_service.ImageRejected):
                await welcome_manual_section_image_service.upload_images(
                    test_org.id, test_user.id, manual.id, section.id,
                    [(b"%PDF-1.7\n%not an image", "doc.pdf", "application/pdf")],
                )


class TestUpdateDelete:
    @pytest.mark.asyncio
    async def test_update_caption(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, section = await _make_section(db, test_org, test_user)
        image = await welcome_manual_section_image_repo.create(
            db, section_id=section.id, storage_key="k", caption=None, display_order=0,
        )
        await db.commit()
        with _patch_uow(db):
            updated = await welcome_manual_section_image_service.update_image(
                test_org.id, test_user.id, manual.id, section.id, image.id,
                {"caption": "The router"},
            )
        assert updated.caption == "The router"
        assert updated.presigned_url is not None

    @pytest.mark.asyncio
    async def test_update_image_not_found(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, section = await _make_section(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_image_service.ImageNotFoundError):
                await welcome_manual_section_image_service.update_image(
                    test_org.id, test_user.id, manual.id, section.id, uuid.uuid4(),
                    {"caption": "x"},
                )

    @pytest.mark.asyncio
    async def test_delete_image(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, section = await _make_section(db, test_org, test_user)
        image = await welcome_manual_section_image_repo.create(
            db, section_id=section.id, storage_key="k", caption=None, display_order=0,
        )
        await db.commit()
        with _patch_uow(db):
            await welcome_manual_section_image_service.delete_image(
                test_org.id, test_user.id, manual.id, section.id, image.id,
            )
            with pytest.raises(welcome_manual_section_image_service.ImageNotFoundError):
                await welcome_manual_section_image_service.delete_image(
                    test_org.id, test_user.id, manual.id, section.id, image.id,
                )


class TestImagesSurfaceInManualResponse:
    @pytest.mark.asyncio
    async def test_get_manual_includes_section_images(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, section = await _make_section(db, test_org, test_user)
        await welcome_manual_section_image_repo.create(
            db, section_id=section.id, storage_key="k1", caption="cap", display_order=0,
        )
        await db.commit()

        @asynccontextmanager
        async def _fake_session():
            yield db

        with patch(
            "app.services.welcome_manuals.welcome_manual_service.AsyncSessionLocal",
            _fake_session,
        ):
            resp = await welcome_manual_service.get_manual(test_org.id, test_user.id, manual.id)

        assert len(resp.sections) == 1
        assert len(resp.sections[0].images) == 1
        assert resp.sections[0].images[0].caption == "cap"
        assert resp.sections[0].images[0].presigned_url is not None
