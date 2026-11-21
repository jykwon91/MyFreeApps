"""Listing photos move to and from storage with no database transaction open.

Storing a photo can take seconds when MinIO is slow. Done inside the
transaction it held the listing's row lock all that time, and a failure part
way through a batch left stored photos with no row pointing at them.
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

from app.models.listings.listing import Listing
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.user.user import User
from app.repositories import listing_photo_repo
from app.services.listings import listing_photo_service
from app.services.storage import presigned_url_attacher

pytestmark = pytest.mark.asyncio


class _Transactions:
    """Stands in for ``unit_of_work`` on the test session and tracks whether one is open."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self.open = 0

    @asynccontextmanager
    async def __call__(self) -> AsyncIterator[AsyncSession]:
        self.open += 1
        try:
            yield self._db
        finally:
            self.open -= 1


class _World:
    def __init__(self, transactions: _Transactions) -> None:
        self.transactions = transactions
        self.open_during_storage: list[int] = []
        self.stored: list[str] = []
        self.deleted: list[str] = []
        self.storage = MagicMock()
        self.storage.generate_key.side_effect = lambda org, name: f"{org}/{uuid.uuid4().hex}/{name}"
        self.storage.upload_file.side_effect = self._upload
        self.storage.delete_files.side_effect = self._delete
        self.storage.object_exists.side_effect = self._exists
        self.storage.generate_presigned_url.side_effect = lambda key, *_a, **_k: f"https://signed/{key}"

    def _upload(self, key: str, _content: bytes, _content_type: str) -> str:
        self.open_during_storage.append(self.transactions.open)
        self.stored.append(key)
        return key

    def _delete(self, keys: list[str]) -> list[str]:
        self.open_during_storage.append(self.transactions.open)
        self.deleted.extend(keys)
        return []

    def _exists(self, _key: str) -> bool:
        self.open_during_storage.append(self.transactions.open)
        return True


@pytest.fixture
def world(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> _World:
    transactions = _Transactions(db)
    w = _World(transactions)
    monkeypatch.setattr(listing_photo_service, "unit_of_work", transactions)
    monkeypatch.setattr(listing_photo_service, "get_storage", lambda: w.storage)
    monkeypatch.setattr(presigned_url_attacher, "get_storage", lambda: w.storage)
    return w


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (16, 16), color=(20, 60, 100)).save(buf, format="JPEG")
    return buf.getvalue()


async def _listing(db: AsyncSession, org: Organization, user: User) -> Listing:
    prop = Property(organization_id=org.id, user_id=user.id, name="House", address="x")
    db.add(prop)
    await db.flush()
    listing = Listing(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, property_id=prop.id,
        title="Listing", monthly_rate=1500, room_type="private_room", status="active",
        amenities=[], pets_on_premises=False,
    )
    db.add(listing)
    await db.commit()
    return listing


async def test_photos_are_stored_and_signed_with_no_transaction_open(
    db: AsyncSession, world: _World, test_org: Organization, test_user: User,
) -> None:
    listing = await _listing(db, test_org, test_user)

    photos = await listing_photo_service.upload_photos(
        test_org.id, test_user.id, listing.id,
        [(_jpeg(), "a.jpg", "image/jpeg"), (_jpeg(), "b.jpg", "image/jpeg")],
    )

    assert len(photos) == 2 and all(p.presigned_url for p in photos)
    assert len(world.stored) == 2
    assert world.open_during_storage and set(world.open_during_storage) == {0}


async def test_a_failed_row_write_removes_every_stored_photo(
    db: AsyncSession, world: _World, test_org: Organization, test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    listing = await _listing(db, test_org, test_user)
    real_create = listing_photo_repo.create
    calls = 0

    async def second_insert_fails(*args: object, **kwargs: object):  # noqa: ANN202
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("insert failed")
        return await real_create(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(listing_photo_repo, "create", second_insert_fails)

    with pytest.raises(RuntimeError, match="insert failed"):
        await listing_photo_service.upload_photos(
            test_org.id, test_user.id, listing.id,
            [(_jpeg(), "a.jpg", "image/jpeg"), (_jpeg(), "b.jpg", "image/jpeg")],
        )
    await db.rollback()

    assert len(world.stored) == 2
    assert sorted(world.deleted) == sorted(world.stored)


async def test_a_missing_listing_stores_nothing(
    world: _World, test_org: Organization, test_user: User,
) -> None:
    with pytest.raises(listing_photo_service.ListingNotFoundError):
        await listing_photo_service.upload_photos(
            test_org.id, test_user.id, uuid.uuid4(), [(_jpeg(), "a.jpg", "image/jpeg")],
        )

    assert world.stored == []


async def test_editing_and_reordering_sign_urls_after_the_transaction(
    db: AsyncSession, world: _World, test_org: Organization, test_user: User,
) -> None:
    listing = await _listing(db, test_org, test_user)
    first, second = await listing_photo_service.upload_photos(
        test_org.id, test_user.id, listing.id,
        [(_jpeg(), "a.jpg", "image/jpeg"), (_jpeg(), "b.jpg", "image/jpeg")],
    )
    world.open_during_storage.clear()

    await listing_photo_service.update_photo(
        test_org.id, test_user.id, listing.id, first.id, {"caption": "Kitchen"},
    )
    await listing_photo_service.reorder_photos(
        test_org.id, test_user.id, listing.id, [second.id, first.id],
    )

    assert world.open_during_storage and set(world.open_during_storage) == {0}


async def test_a_deleted_photo_is_removed_from_storage(
    db: AsyncSession, world: _World, test_org: Organization, test_user: User,
) -> None:
    listing = await _listing(db, test_org, test_user)
    [photo] = await listing_photo_service.upload_photos(
        test_org.id, test_user.id, listing.id, [(_jpeg(), "a.jpg", "image/jpeg")],
    )

    await listing_photo_service.delete_photo(test_org.id, test_user.id, listing.id, photo.id)

    assert world.deleted == world.stored

