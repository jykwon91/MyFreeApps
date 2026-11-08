"""Blackout attachment uploads never store an image's location metadata.

Runs the real upload_attachment pipeline with storage and the repositories
faked, so the bytes handed to storage can be inspected.
"""
from __future__ import annotations

import io
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from PIL import Image

from app.services.listings import blackout_service
from app.services.listings.blackout_service import (
    AttachmentTypeRejectedError,
    upload_attachment,
)
from tests.gps_photo import gps_of, photo_with_gps


@dataclass
class _Upload:
    storage: MagicMock
    rows: list[dict[str, object]] = field(default_factory=list)

    @property
    def stored_bytes(self) -> bytes:
        return self.storage.upload_file.call_args.args[1]


@pytest.fixture
def upload() -> Iterator[_Upload]:
    recorded = _Upload(storage=MagicMock())

    @asynccontextmanager
    async def _fake_uow():
        yield MagicMock()

    async def _create(_db: object, **row: object) -> SimpleNamespace:
        recorded.rows.append(row)
        return SimpleNamespace(id=uuid.uuid4(), presigned_url=None, **row)

    with (
        patch.object(blackout_service, "get_storage", return_value=recorded.storage),
        patch.object(blackout_service, "unit_of_work", _fake_uow),
        patch.object(
            blackout_service.listing_blackout_repo,
            "get_by_id_scoped_to_organization",
            new=AsyncMock(return_value=MagicMock()),
        ),
        patch.object(blackout_service.listing_blackout_attachment_repo, "create", new=_create),
        patch.object(blackout_service, "attach_presigned_urls", side_effect=lambda rows: rows),
    ):
        yield recorded


async def _upload(content: bytes, filename: str = "photo") -> None:
    await upload_attachment(
        organization_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        blackout_id=uuid.uuid4(),
        content=content,
        filename=filename,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(("fmt", "mime"), [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")])
async def test_stored_photo_has_no_gps(upload: _Upload, fmt: str, mime: str) -> None:
    photo = photo_with_gps(fmt)
    assert gps_of(photo), "fixture must carry GPS"

    await _upload(photo)

    assert gps_of(upload.stored_bytes) == {}
    assert upload.rows[0]["content_type"] == mime
    assert upload.rows[0]["size_bytes"] == len(upload.stored_bytes)


@pytest.mark.asyncio
async def test_an_image_that_cant_be_cleaned_is_rejected_and_nothing_is_stored(upload: _Upload) -> None:
    broken_jpeg = b"\xff\xd8\xff" + b"MZ\x90\x00" * 100

    with pytest.raises(AttachmentTypeRejectedError, match="Couldn't read this image"):
        await _upload(broken_jpeg)

    upload.storage.upload_file.assert_not_called()
    assert upload.rows == []


@pytest.mark.asyncio
async def test_a_png_labelled_as_jpeg_bytes_is_rejected(upload: _Upload) -> None:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buf, format="PNG")
    # JPEG magic bytes glued onto a PNG body: sniffs as JPEG, decodes as nothing.
    disguised = b"\xff\xd8\xff" + buf.getvalue()

    with pytest.raises(AttachmentTypeRejectedError):
        await _upload(disguised)

    upload.storage.upload_file.assert_not_called()


@pytest.mark.asyncio
async def test_pdf_is_stored_unchanged(upload: _Upload) -> None:
    pdf = b"%PDF-1.4 some content"

    await _upload(pdf, filename="notes.pdf")

    assert upload.stored_bytes == pdf
