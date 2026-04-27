"""Tests for `services/listings/photo_response_builder.py`.

Covers:
- presigned URL injection happy path
- graceful degradation when storage is unavailable (returns None for url)
- per-row resilience: a single signing failure doesn't poison the batch
- empty input is a no-op
- input is not mutated
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

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

    def test_returns_none_url_when_storage_not_configured(self) -> None:
        photos = [_make_response(), _make_response()]
        with patch(
            "app.services.listings.photo_response_builder.get_storage",
            return_value=None,
        ):
            result = attach_presigned_urls(photos)
        assert all(p.presigned_url is None for p in result)
        # Original input is not mutated.
        assert all(p.presigned_url is None for p in photos)

    def test_signs_each_photo_when_storage_configured(self) -> None:
        photos = [_make_response("a"), _make_response("b")]
        storage = MagicMock()
        storage.generate_presigned_url.side_effect = lambda key, ttl: f"https://signed/{key}"
        with patch(
            "app.services.listings.photo_response_builder.get_storage",
            return_value=storage,
        ):
            result = attach_presigned_urls(photos)

        assert result[0].presigned_url == "https://signed/a"
        assert result[1].presigned_url == "https://signed/b"
        # TTL passed through from settings.
        assert storage.generate_presigned_url.call_count == 2

    def test_per_row_failure_does_not_poison_batch(self) -> None:
        photos = [_make_response("a"), _make_response("b")]
        storage = MagicMock()
        storage.generate_presigned_url.side_effect = [
            RuntimeError("transient failure"),
            "https://signed/b",
        ]
        with patch(
            "app.services.listings.photo_response_builder.get_storage",
            return_value=storage,
        ):
            result = attach_presigned_urls(photos)

        assert result[0].presigned_url is None
        assert result[1].presigned_url == "https://signed/b"

    def test_does_not_mutate_input(self) -> None:
        photo = _make_response("k")
        original_id = photo.id
        with patch(
            "app.services.listings.photo_response_builder.get_storage",
            return_value=None,
        ):
            attach_presigned_urls([photo])
        # Same object, unchanged.
        assert photo.id == original_id
        assert photo.presigned_url is None
