"""Documents never store a photo's location metadata.

Covers every way a file becomes a document: an upload, a photo inside an
uploaded zip, replacing a document's file, and a Gmail attachment fetched for
extraction. Each test runs the real service against the database; storage is
the in-memory fake from conftest, so the bytes it was handed can be inspected.
"""
from __future__ import annotations

import hashlib
import io
import uuid
import zipfile
from collections.abc import Iterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.storage import get_storage
from app.models.documents.document import Document
from app.models.email.email_queue import EmailQueue
from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.repositories import document_repo, email_queue_repo, sync_log_repo
from app.services.documents import document_service, document_upload_service
from app.services.documents.document_service import replace_file
from app.services.documents.document_upload_service import accept_upload
from app.services.email import email_fetch_service
from app.services.email.constants import UNREADABLE_EMAIL_PHOTO_ERROR
from tests.gps_photo import gps_of, photo_with_gps

_BROKEN_JPEG = b"\xff\xd8\xff" + b"MZ\x90\x00" * 100
_PDF = b"%PDF-1.4 a receipt"


@pytest.fixture(autouse=True)
def _wire(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _session():
        yield db

    with (
        patch.object(document_upload_service, "unit_of_work", _session),
        patch.object(document_service, "unit_of_work", _session),
        patch.object(email_fetch_service, "unit_of_work", _session),
        patch.object(email_fetch_service, "AsyncSessionLocal", _session),
    ):
        yield


@pytest.fixture
def ctx(test_org: Organization, test_user: User) -> RequestContext:
    return RequestContext(organization_id=test_org.id, user_id=test_user.id, org_role=OrgRole.OWNER)


def _stored_bytes() -> list[bytes]:
    return [c.args[1] for c in get_storage().upload_file.call_args_list]


def _zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return buf.getvalue()


@pytest.mark.asyncio
@pytest.mark.parametrize(("fmt", "filename", "mime"), [
    ("JPEG", "receipt.jpg", "image/jpeg"),
    ("PNG", "receipt.png", "image/png"),
    ("WEBP", "receipt.webp", "image/webp"),
])
async def test_an_uploaded_photo_is_stored_without_its_location(
    db: AsyncSession, ctx: RequestContext, fmt: str, filename: str, mime: str,
) -> None:
    photo = photo_with_gps(fmt)
    assert gps_of(photo), "fixture must carry GPS"

    result = await accept_upload(ctx, photo, filename, mime)

    [stored] = _stored_bytes()
    assert gps_of(stored) == {}
    doc = await db.get(Document, uuid.UUID(str(result["document_id"])))
    assert doc is not None
    assert doc.content_hash == hashlib.sha256(stored).hexdigest()


@pytest.mark.asyncio
async def test_the_same_photo_uploaded_twice_is_still_a_duplicate(ctx: RequestContext) -> None:
    photo = photo_with_gps("JPEG")

    first = await accept_upload(ctx, photo, "receipt.jpg", "image/jpeg")
    second = await accept_upload(ctx, photo, "receipt.jpg", "image/jpeg")

    assert second.get("duplicate") is True
    assert second["document_id"] == first["document_id"]


@pytest.mark.asyncio
async def test_a_photo_named_as_a_pdf_still_loses_its_location(ctx: RequestContext) -> None:
    await accept_upload(ctx, photo_with_gps("JPEG"), "receipt.pdf", "application/pdf")

    [stored] = _stored_bytes()
    assert gps_of(stored) == {}


@pytest.mark.asyncio
async def test_a_photo_that_cant_be_read_is_refused_and_nothing_is_stored(
    db: AsyncSession, ctx: RequestContext,
) -> None:
    with pytest.raises(ValueError, match="Couldn't read the image 'receipt.jpg'"):
        await accept_upload(ctx, _BROKEN_JPEG, "receipt.jpg", "image/jpeg")

    assert _stored_bytes() == []
    assert await document_repo.find_by_content_hash(db, ctx.organization_id, hashlib.sha256(_BROKEN_JPEG).hexdigest()) is None


@pytest.mark.asyncio
async def test_a_pdf_is_stored_unchanged(ctx: RequestContext) -> None:
    await accept_upload(ctx, _PDF, "receipt.pdf", "application/pdf")

    assert _stored_bytes() == [_PDF]


@pytest.mark.asyncio
async def test_photos_inside_an_uploaded_zip_lose_their_location(ctx: RequestContext) -> None:
    archive = _zip({"a.jpg": photo_with_gps("JPEG"), "b.png": photo_with_gps("PNG"), "c.pdf": _PDF})

    result = await accept_upload(ctx, archive, "receipts.zip", "application/zip")

    assert result["batch_total"] == 3
    stored = _stored_bytes()
    assert _PDF in stored
    photos = [b for b in stored if b != _PDF]
    assert len(photos) == 2
    assert all(gps_of(p) == {} for p in photos)


@pytest.mark.asyncio
async def test_a_zip_with_an_unreadable_photo_is_refused_before_anything_is_stored(ctx: RequestContext) -> None:
    archive = _zip({"a.pdf": _PDF, "broken.jpg": _BROKEN_JPEG})

    with pytest.raises(ValueError, match="Couldn't read the image 'broken.jpg'"):
        await accept_upload(ctx, archive, "receipts.zip", "application/zip")

    assert _stored_bytes() == []


@pytest.mark.asyncio
async def test_replacing_a_documents_file_with_a_photo_drops_its_location(
    db: AsyncSession, ctx: RequestContext,
) -> None:
    result = await accept_upload(ctx, _PDF, "receipt.pdf", "application/pdf")
    document_id = uuid.UUID(str(result["document_id"]))
    # An upload is still queued for extraction; a file can only be replaced once it is read.
    await db.execute(update(Document).where(Document.id == document_id).values(status="completed"))
    await db.commit()

    await replace_file(ctx, document_id, photo_with_gps("JPEG"), "receipt.jpg", "image/jpeg")

    assert gps_of(_stored_bytes()[-1]) == {}


@pytest.mark.asyncio
async def test_replacing_with_an_unreadable_photo_keeps_the_old_file(
    db: AsyncSession, ctx: RequestContext,
) -> None:
    result = await accept_upload(ctx, _PDF, "receipt.pdf", "application/pdf")
    document_id = uuid.UUID(str(result["document_id"]))

    with pytest.raises(ValueError, match="Couldn't read the image"):
        await replace_file(ctx, document_id, _BROKEN_JPEG, "receipt.jpg", "image/jpeg")

    doc = await db.get(Document, document_id)
    assert doc is not None
    assert doc.file_name == "receipt.pdf"
    assert _stored_bytes() == [_PDF]


@pytest.fixture
async def queued_attachment(db: AsyncSession, test_org: Organization, test_user: User) -> EmailQueue:
    integration = Integration(organization_id=test_org.id, user_id=test_user.id, provider="gmail", metadata_={})
    integration.access_token = "access"
    integration.refresh_token = "refresh"
    db.add(integration)
    log = await sync_log_repo.create(
        db, test_org.id, test_user.id, "gmail", "running", started_at=datetime.now(UTC),
    )
    item = EmailQueue(
        organization_id=test_org.id,
        user_id=test_user.id,
        message_id="msg-1",
        attachment_id="att-1",
        attachment_filename="receipt.jpg",
        attachment_content_type="image/jpeg",
        sync_log_id=log.id,
        status="pending",
    )
    db.add(item)
    await db.commit()
    return item


async def _fetch_attachment(ctx: RequestContext, content: bytes) -> None:
    with (
        patch.object(email_fetch_service, "get_gmail_service", return_value=(MagicMock(), MagicMock(token="t"))),
        patch.object(email_fetch_service, "fetch_attachment_bytes", return_value=content),
        patch.object(email_fetch_service, "persist_refreshed_token"),
    ):
        await email_fetch_service._fetch_next_pending(ctx)


@pytest.mark.asyncio
async def test_an_emailed_photo_is_saved_without_its_location(
    db: AsyncSession, ctx: RequestContext, queued_attachment: EmailQueue,
) -> None:
    await _fetch_attachment(ctx, photo_with_gps("JPEG"))

    item = await email_queue_repo.get_with_content(db, queued_attachment.id, ctx.organization_id)
    assert item is not None
    assert item.status == "fetched"
    assert item.raw_content is not None
    assert gps_of(item.raw_content) == {}


@pytest.mark.asyncio
async def test_an_emailed_photo_that_cant_be_read_is_not_saved(
    db: AsyncSession, ctx: RequestContext, queued_attachment: EmailQueue,
) -> None:
    await _fetch_attachment(ctx, _BROKEN_JPEG)

    item = await email_queue_repo.get_with_content(db, queued_attachment.id, ctx.organization_id)
    assert item is not None
    assert (item.status, item.error, item.raw_content) == ("failed", UNREADABLE_EMAIL_PHOTO_ERROR, None)


@pytest.mark.asyncio
async def test_an_emailed_pdf_is_saved_unchanged(
    db: AsyncSession, ctx: RequestContext, queued_attachment: EmailQueue,
) -> None:
    await _fetch_attachment(ctx, _PDF)

    item = await email_queue_repo.get_with_content(db, queued_attachment.id, ctx.organization_id)
    assert item is not None
    assert item.raw_content == _PDF
