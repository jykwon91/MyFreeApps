"""Welcome-manual images move to and from storage with no transaction open.

Done inside the transaction, an upload held the section's row lock for as long
as MinIO took, and a failure part way through a batch left stored images with
no row pointing at them.
"""
from __future__ import annotations

import io
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import MagicMock

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
from app.services.storage import presigned_url_attacher
from app.services.welcome_manuals import welcome_manual_section_image_service as images

pytestmark = pytest.mark.asyncio


class _World:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self.open = 0
        self.open_during_storage: list[int] = []
        self.stored: list[str] = []
        self.deleted: list[str] = []
        self.storage = MagicMock()
        self.storage.generate_key.side_effect = lambda prefix, name: f"{prefix}/{uuid.uuid4().hex}/{name}"
        self.storage.upload_file.side_effect = self._upload
        self.storage.delete_files.side_effect = self._delete
        self.storage.object_exists.side_effect = self._exists
        self.storage.generate_presigned_url.side_effect = lambda key, *_a, **_k: f"https://signed/{key}"

    @asynccontextmanager
    async def unit_of_work(self) -> AsyncIterator[AsyncSession]:
        self.open += 1
        try:
            yield self._db
        finally:
            self.open -= 1

    def _upload(self, key: str, _content: bytes, _content_type: str) -> str:
        self.open_during_storage.append(self.open)
        self.stored.append(key)
        return key

    def _delete(self, keys: list[str]) -> list[str]:
        self.open_during_storage.append(self.open)
        self.deleted.extend(keys)
        return []

    def _exists(self, _key: str) -> bool:
        self.open_during_storage.append(self.open)
        return True


@pytest.fixture
def world(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> _World:
    w = _World(db)
    monkeypatch.setattr(images, "unit_of_work", w.unit_of_work)
    monkeypatch.setattr(images, "get_storage", lambda: w.storage)
    monkeypatch.setattr(presigned_url_attacher, "get_storage", lambda: w.storage)
    return w


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (16, 16), color=(20, 60, 100)).save(buf, format="JPEG")
    return buf.getvalue()


async def _section(db: AsyncSession, org: Organization, user: User) -> tuple[uuid.UUID, uuid.UUID]:
    manual = await welcome_manual_repo.create_manual(
        db, organization_id=org.id, user_id=user.id, property_id=None, title="Guide", intro_text=None,
    )
    section = await welcome_manual_section_repo.create(
        db, manual_id=manual.id, title="Kitchen", body=None, display_order=0,
    )
    await db.commit()
    return manual.id, section.id


async def test_images_are_stored_and_signed_with_no_transaction_open(
    db: AsyncSession, world: _World, test_org: Organization, test_user: User,
) -> None:
    manual_id, section_id = await _section(db, test_org, test_user)

    uploaded = await images.upload_images(
        test_org.id, test_user.id, manual_id, section_id,
        [(_jpeg(), "a.jpg", "image/jpeg"), (_jpeg(), "b.jpg", "image/jpeg")],
    )
    await images.update_image(test_org.id, test_user.id, manual_id, section_id, uploaded[0].id, {"caption": "c"})
    await images.reorder_images(
        test_org.id, test_user.id, manual_id, section_id, [uploaded[1].id, uploaded[0].id],
    )

    assert len(world.stored) == 2
    assert world.open_during_storage and set(world.open_during_storage) == {0}


async def test_a_failed_row_write_removes_every_stored_image(
    db: AsyncSession, world: _World, test_org: Organization, test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manual_id, section_id = await _section(db, test_org, test_user)
    real_create = welcome_manual_section_image_repo.create
    calls = 0

    async def second_insert_fails(*args: object, **kwargs: object):  # noqa: ANN202
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("insert failed")
        return await real_create(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(images.welcome_manual_section_image_repo, "create", second_insert_fails)

    with pytest.raises(RuntimeError, match="insert failed"):
        await images.upload_images(
            test_org.id, test_user.id, manual_id, section_id,
            [(_jpeg(), "a.jpg", "image/jpeg"), (_jpeg(), "b.jpg", "image/jpeg")],
        )
    await db.rollback()

    assert len(world.stored) == 2
    assert sorted(world.deleted) == sorted(world.stored)


async def test_a_commit_that_raised_keeps_images_under_a_manual_soft_deleted_meanwhile(
    db: AsyncSession, world: _World, test_org: Organization, test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The rows committed, then the manual was soft-deleted: the images are still referenced
    and must not be removed from storage."""
    manual_id, section_id = await _section(db, test_org, test_user)
    opened = 0

    @asynccontextmanager
    async def commit_lands_then_raises() -> AsyncIterator[AsyncSession]:
        nonlocal opened
        opened += 1
        yield db
        if opened == 2:  # the write: it commits, a soft-delete follows, then the error
            await db.commit()
            await welcome_manual_repo.soft_delete_by_id(db, manual_id, test_org.id)
            await db.commit()
            raise ConnectionError("connection lost during COMMIT")

    monkeypatch.setattr(images, "unit_of_work", commit_lands_then_raises)

    # The check finds the committed rows, so the upload reports success.
    uploaded = await images.upload_images(
        test_org.id, test_user.id, manual_id, section_id, [(_jpeg(), "a.jpg", "image/jpeg")],
    )

    assert len(uploaded) == 1
    assert len(world.stored) == 1
    assert world.deleted == []
    rows = await welcome_manual_section_image_repo.list_by_section(db, section_id)
    assert [r.storage_key for r in rows] == world.stored
