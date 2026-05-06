"""Tests for `services/listings/photo_response_builder.py`.

Storage is a hard requirement (lifespan refuses to boot if MinIO is
unreachable). Per-request signing is purely cryptographic — failures
must propagate so the request returns 500 rather than silently degrade
to ``presigned_url=None`` placeholders.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.core.storage import StorageNotConfiguredError
from app.schemas.listings.listing_photo_response import ListingPhotoResponse
from app.services.listings.photo_response_builder import attach_presigned_urls


def _make_response(storage_key: str = "org/uuid/photo.jpg") -> ListingPhotoResponse:
    return ListingPhotoResponse(
        id=uuid.uuid4(),
        listing_id=uuid.uuid4(),
        storage_key=storage_key,
        caption=None,
        display_order=0,
        created_at=datetime.now(timezone.utc),
        presigned_url=None,
    )


class TestAttachPresignedUrls:
    def test_empty_list_returns_immediately(self) -> None:
        result = attach_presigned_urls([])
        assert result == []

    def test_propagates_storage_misconfig(self) -> None:
        photos = [_make_response()]
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            side_effect=StorageNotConfiguredError("MINIO_ENDPOINT unset"),
        ):
            with pytest.raises(StorageNotConfiguredError):
                attach_presigned_urls(photos)

    def test_signs_each_photo_when_storage_configured(self) -> None:
        photos = [_make_response("a"), _make_response("b")]
        storage = MagicMock()
        storage.object_exists.return_value = True
        storage.generate_presigned_url.side_effect = lambda key, ttl: f"https://signed/{key}"
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            result = attach_presigned_urls(photos)

        assert result[0].presigned_url == "https://signed/a"
        assert result[1].presigned_url == "https://signed/b"
        assert storage.generate_presigned_url.call_count == 2

    def test_per_row_signing_error_propagates(self) -> None:
        """A signing exception is never swallowed. The request returns 500
        with the real stack trace; silent ``presigned_url=None`` is gone."""
        photos = [_make_response("a"), _make_response("b")]
        storage = MagicMock()
        storage.object_exists.return_value = True
        storage.generate_presigned_url.side_effect = RuntimeError("signing exploded")
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            with pytest.raises(RuntimeError, match="signing exploded"):
                attach_presigned_urls(photos)

    def test_does_not_mutate_input(self) -> None:
        photo = _make_response("k")
        original_id = photo.id
        storage = MagicMock()
        storage.object_exists.return_value = True
        storage.generate_presigned_url.return_value = "https://signed/k"
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            attach_presigned_urls([photo])
        # Original object unchanged (model_copy returns a new instance).
        assert photo.id == original_id
        assert photo.presigned_url is None
