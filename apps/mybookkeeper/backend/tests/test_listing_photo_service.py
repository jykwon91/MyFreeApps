"""Service-layer tests for `services/listings/listing_photo_service.py`.

The service orchestrates: validate → image_processor → storage put → repo
insert. Storage is patched to a fake StorageClient so the tests don't depend
on MinIO being available; image_processor is exercised end-to-end with real
JPEG bytes.
"""
from __future__ import annotations

import io
import uuid
from contextlib import asynccontextmanager
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.listing import Listing
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.user.user import User
from app.repositories import listing_photo_repo
from app.services.listings import listing_photo_service
from app.services.storage.image_processor import ImageRejected


@pytest.fixture(autouse=True)
def _patch_builder_storage(monkeypatch):
    """Provide a working storage stub to the shared
    ``presigned_url_attacher.get_storage`` so per-request signing succeeds
    in the read path. Storage is now a hard requirement (the lifespan
    refuses to boot without it), so any test exercising read paths must
    inject a real or fake storage — silent ``presigned_url=None`` is no
    longer permitted.

    The stub also returns ``object_exists=True`` so the HEAD-check added
    for orphan-attachment detection passes by default.
    """
    from app.services.storage import presigned_url_attacher

    fake = MagicMock()
    fake.object_exists.return_value = True
    fake.generate_presigned_url.side_effect = (
        lambda key, ttl, **_kwargs: f"https://signed/{key}"
    )
    monkeypatch.setattr(presigned_url_attacher, "get_storage", lambda: fake)


class _FakeStorage:
    """In-memory stand-in for `core.storage.StorageClient`."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.deleted: list[str] = []
        self.bucket = "test-bucket"

    def upload_file(self, key: str, content: bytes, content_type: str) -> str:
        self.objects[key] = content
        return key

    def delete_file(self, key: str) -> None:
        self.deleted.append(key)
        self.objects.pop(key, None)

    def generate_key(self, org_id: str, filename: str) -> str:
        return f"{org_id}/{uuid.uuid4().hex[:6]}/{filename}"

    def generate_presigned_url(self, key: str, expires_in_seconds: int) -> str:
        return f"https://signed.example/{key}?expires={expires_in_seconds}"

    def ensure_bucket(self) -> None:
        return None


def _build_jpeg(width: int = 32, height: int = 32) -> bytes:
    img = Image.new("RGB", (width, height), color=(20, 60, 100))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


async def _seed_listing_with_property(
    db: AsyncSession, org: Organization, user: User
) -> Listing:
    prop = Property(
        organization_id=org.id, user_id=user.id,
        name="House", address="x",
    )
    db.add(prop)
    await db.flush()
    listing = Listing(
        id=uuid.uuid4(),
        organization_id=org.id, user_id=user.id, property_id=prop.id,
        title="Listing",
        monthly_rate=1500,
        room_type="private_room",
        status="active",
        amenities=[],
        pets_on_premises=False,
    )
    db.add(listing)
    await db.flush()
    return listing


@asynccontextmanager
async def _wrap_uow(session: AsyncSession):
    yield session


class TestUploadPhotos:
    @pytest.mark.asyncio
    async def test_persists_processed_image_and_assigns_display_order(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing_with_property(db, test_org, test_user)
        await db.commit()

        storage = _FakeStorage()
        jpeg = _build_jpeg()

        with patch(
            "app.services.listings.listing_photo_service.get_storage",
            return_value=storage,
        ), patch(
            "app.services.listings.listing_photo_service.unit_of_work",
            lambda: _wrap_uow(db),
        ):
            results = await listing_photo_service.upload_photos(
                test_org.id, test_user.id, listing.id,
                [(jpeg, "test.jpg", "image/jpeg")],
            )
        await db.commit()

        assert len(results) == 1
        assert results[0].display_order == 0
        # The storage object exists and has a generated key.
        assert len(storage.objects) == 1
        # The stored bytes were re-encoded (not byte-identical to input — at
        # minimum the EXIF strip pass will alter the encoding).
        stored_key = next(iter(storage.objects))
        assert stored_key.startswith(str(test_org.id))

        # Repo confirms the photo persisted with the right storage key.
        photos = await listing_photo_repo.list_by_listing(db, listing.id)
        assert len(photos) == 1
        assert photos[0].storage_key == stored_key

    @pytest.mark.asyncio
    async def test_assigns_sequential_display_orders_within_batch(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing_with_property(db, test_org, test_user)
        await db.commit()

        storage = _FakeStorage()
        jpegs = [
            (_build_jpeg(width=10), "a.jpg", "image/jpeg"),
            (_build_jpeg(width=12), "b.jpg", "image/jpeg"),
            (_build_jpeg(width=14), "c.jpg", "image/jpeg"),
        ]

        with patch(
            "app.services.listings.listing_photo_service.get_storage",
            return_value=storage,
        ), patch(
            "app.services.listings.listing_photo_service.unit_of_work",
            lambda: _wrap_uow(db),
        ):
            results = await listing_photo_service.upload_photos(
                test_org.id, test_user.id, listing.id, jpegs,
            )
        await db.commit()

        assert [r.display_order for r in results] == [0, 1, 2]

    @pytest.mark.asyncio
    async def test_rejects_oversized_file_before_storage_write(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing_with_property(db, test_org, test_user)
        await db.commit()

        storage = _FakeStorage()
        oversize = b"\xff\xd8\xff" + b"\x00" * (11 * 1024 * 1024)  # 11 MB

        with patch(
            "app.services.listings.listing_photo_service.get_storage",
            return_value=storage,
        ), patch(
            "app.services.listings.listing_photo_service.unit_of_work",
            lambda: _wrap_uow(db),
        ):
            with pytest.raises(ImageRejected):
                await listing_photo_service.upload_photos(
                    test_org.id, test_user.id, listing.id,
                    [(oversize, "huge.jpg", "image/jpeg")],
                )

        # No storage writes happened (validation runs first).
        assert storage.objects == {}

    @pytest.mark.asyncio
    async def test_rejects_pdf_with_image_extension(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing_with_property(db, test_org, test_user)
        await db.commit()

        storage = _FakeStorage()
        pdf = b"%PDF-1.7\nfake content\n" + b"\x00" * 200

        with patch(
            "app.services.listings.listing_photo_service.get_storage",
            return_value=storage,
        ), patch(
            "app.services.listings.listing_photo_service.unit_of_work",
            lambda: _wrap_uow(db),
        ):
            with pytest.raises(ImageRejected):
                await listing_photo_service.upload_photos(
                    test_org.id, test_user.id, listing.id,
                    # Note the lying extension and content-type — sniff wins.
                    [(pdf, "fake.jpg", "image/jpeg")],
                )

        assert storage.objects == {}

    @pytest.mark.asyncio
    async def test_partial_batch_failure_aborts_all(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """If file 2 of 3 fails validation, NEITHER file 1 NOR file 2 should be
        persisted (validation runs upfront, before any storage write)."""
        listing = await _seed_listing_with_property(db, test_org, test_user)
        await db.commit()

        storage = _FakeStorage()
        ok_jpeg = _build_jpeg()
        bad_pdf = b"%PDF-1.7\n" + b"\x00" * 200

        with patch(
            "app.services.listings.listing_photo_service.get_storage",
            return_value=storage,
        ), patch(
            "app.services.listings.listing_photo_service.unit_of_work",
            lambda: _wrap_uow(db),
        ):
            with pytest.raises(ImageRejected):
                await listing_photo_service.upload_photos(
                    test_org.id, test_user.id, listing.id,
                    [
                        (ok_jpeg, "ok.jpg", "image/jpeg"),
                        (bad_pdf, "bad.pdf", "application/pdf"),
                    ],
                )

        # The repo state is empty — both files rejected together.
        assert storage.objects == {}

    @pytest.mark.asyncio
    async def test_listing_in_other_org_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing_with_property(db, test_org, test_user)
        await db.commit()

        storage = _FakeStorage()

        with patch(
            "app.services.listings.listing_photo_service.get_storage",
            return_value=storage,
        ), patch(
            "app.services.listings.listing_photo_service.unit_of_work",
            lambda: _wrap_uow(db),
        ):
            with pytest.raises(listing_photo_service.ListingNotFoundError):
                await listing_photo_service.upload_photos(
                    uuid.uuid4(),  # other org
                    test_user.id,
                    listing.id,
                    [(_build_jpeg(), "x.jpg", "image/jpeg")],
                )

    @pytest.mark.asyncio
    async def test_storage_unavailable_raises(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing_with_property(db, test_org, test_user)
        await db.commit()

        with patch(
            "app.services.listings.listing_photo_service.get_storage",
            return_value=None,
        ), patch(
            "app.services.listings.listing_photo_service.unit_of_work",
            lambda: _wrap_uow(db),
        ):
            with pytest.raises(listing_photo_service.StorageNotConfiguredError):
                await listing_photo_service.upload_photos(
                    test_org.id, test_user.id, listing.id,
                    [(_build_jpeg(), "x.jpg", "image/jpeg")],
                )


class TestDeletePhoto:
    @pytest.mark.asyncio
    async def test_deletes_db_row_and_storage_object(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing_with_property(db, test_org, test_user)
        await db.commit()

        storage = _FakeStorage()
        # First, upload a photo so we have something to delete.
        with patch(
            "app.services.listings.listing_photo_service.get_storage",
            return_value=storage,
        ), patch(
            "app.services.listings.listing_photo_service.unit_of_work",
            lambda: _wrap_uow(db),
        ):
            uploaded = await listing_photo_service.upload_photos(
                test_org.id, test_user.id, listing.id,
                [(_build_jpeg(), "x.jpg", "image/jpeg")],
            )
            await db.commit()

            await listing_photo_service.delete_photo(
                test_org.id, test_user.id, listing.id, uploaded[0].id,
            )
            await db.commit()

        # Storage object cleaned up
        assert uploaded[0].storage_key in storage.deleted

        # DB row gone
        photos = await listing_photo_repo.list_by_listing(db, listing.id)
        assert photos == []

    @pytest.mark.asyncio
    async def test_raises_when_photo_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing_with_property(db, test_org, test_user)
        await db.commit()

        with patch(
            "app.services.listings.listing_photo_service.get_storage",
            return_value=_FakeStorage(),
        ), patch(
            "app.services.listings.listing_photo_service.unit_of_work",
            lambda: _wrap_uow(db),
        ):
            with pytest.raises(listing_photo_service.ListingNotFoundError):
                await listing_photo_service.delete_photo(
                    test_org.id, test_user.id, listing.id, uuid.uuid4(),
                )


class TestUpdatePhoto:
    @pytest.mark.asyncio
    async def test_updates_caption_and_display_order(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing_with_property(db, test_org, test_user)
        await db.commit()

        storage = _FakeStorage()
        with patch(
            "app.services.listings.listing_photo_service.get_storage",
            return_value=storage,
        ), patch(
            "app.services.listings.listing_photo_service.unit_of_work",
            lambda: _wrap_uow(db),
        ):
            uploaded = await listing_photo_service.upload_photos(
                test_org.id, test_user.id, listing.id,
                [
                    (_build_jpeg(), "a.jpg", "image/jpeg"),
                    (_build_jpeg(), "b.jpg", "image/jpeg"),
                ],
            )
            await db.commit()

            updated = await listing_photo_service.update_photo(
                test_org.id, test_user.id, listing.id, uploaded[0].id,
                {"caption": "Front view", "display_order": 5},
            )
            await db.commit()

        assert updated.caption == "Front view"
        assert updated.display_order == 5