"""A document's stored and served type comes from its bytes, never the uploader's claim.

A member could otherwise upload ``x.pdf`` with ``Content-Type: text/html`` and
have the HTML served back to whoever opens the document. Each test runs the
real service against the database; storage is the in-memory fake from
conftest, extended here to hand back what was uploaded.
"""
from __future__ import annotations

import io
import uuid
import zipfile
from collections.abc import Iterator
from contextlib import asynccontextmanager
from unittest.mock import patch

import openpyxl
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.storage import get_storage
from app.models.documents.document import Document
from app.models.email.email_types import Attachment
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.services.documents import (
    document_query_service,
    document_service,
    document_upload_service,
)
from app.services.documents.document_mime_constants import OCTET_STREAM_MIME
from app.services.documents.document_query_service import get_document_download
from app.services.documents.document_service import replace_file
from app.services.documents.document_upload_service import accept_upload
from app.services.extraction.extraction_persistence import _resolve_attachment_content
from app.services.storage.attachment_content import XLSX_MIME
from tests.gps_photo import photo_with_gps

_HTML = b"<!doctype html><html><body><script>alert(document.cookie)</script></body></html>"
_PDF = b"%PDF-1.4 a receipt"


@pytest.fixture(autouse=True)
def _wire(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _session():
        yield db

    stored: dict[str, bytes] = {}
    storage = get_storage()

    def _upload(key: str, content: bytes, content_type: str) -> str:
        stored[key] = content
        return key

    storage.upload_file.side_effect = _upload
    storage.download_file.side_effect = lambda key: stored[key]

    with (
        patch.object(document_upload_service, "unit_of_work", _session),
        patch.object(document_service, "unit_of_work", _session),
        patch.object(document_query_service, "AsyncSessionLocal", _session),
    ):
        yield


@pytest.fixture
def ctx(test_org: Organization, test_user: User) -> RequestContext:
    return RequestContext(organization_id=test_org.id, user_id=test_user.id, org_role=OrgRole.OWNER)


def _stored_content_types() -> list[str]:
    return [c.args[2] for c in get_storage().upload_file.call_args_list]


def _zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return buf.getvalue()


def _xlsx() -> bytes:
    workbook = openpyxl.Workbook()
    workbook.active.append(["date", "amount"])
    buf = io.BytesIO()
    workbook.save(buf)
    return buf.getvalue()


async def _upload(db: AsyncSession, ctx: RequestContext, content: bytes, filename: str, claimed: str) -> Document:
    result = await accept_upload(ctx, content, filename, claimed)
    doc = await db.get(Document, uuid.UUID(str(result["document_id"])))
    assert doc is not None
    return doc


@pytest.mark.asyncio
async def test_html_uploaded_as_a_pdf_is_not_stored_or_served_as_html(
    db: AsyncSession, ctx: RequestContext,
) -> None:
    doc = await _upload(db, ctx, _HTML, "invoice.pdf", "text/html")

    assert doc.file_mime_type == OCTET_STREAM_MIME
    assert _stored_content_types() == [OCTET_STREAM_MIME]

    download = await get_document_download(ctx, doc.id)
    assert download is not None
    assert download.media_type == OCTET_STREAM_MIME
    assert download.disposition.startswith("attachment")


@pytest.mark.asyncio
@pytest.mark.parametrize(("content", "filename", "claimed", "expected"), [
    (_PDF, "receipt.pdf", "text/html", "application/pdf"),
    (photo_with_gps("JPEG"), "receipt.jpg", "text/html", "image/jpeg"),
    (photo_with_gps("PNG"), "receipt.jpg", "image/jpeg", "image/png"),
    (b"date,amount\n2026-01-01,12.50\n", "bank.csv", "text/html", "text/plain"),
    (_xlsx(), "bank.xlsx", "text/html", XLSX_MIME),
], ids=["pdf", "jpeg", "png-named-jpg", "csv", "xlsx"])
async def test_a_real_file_is_stored_as_what_its_bytes_are(
    db: AsyncSession, ctx: RequestContext, content: bytes, filename: str, claimed: str, expected: str,
) -> None:
    doc = await _upload(db, ctx, content, filename, claimed)

    assert doc.file_mime_type == expected
    assert _stored_content_types() == [expected]


@pytest.mark.asyncio
async def test_a_real_pdf_is_still_served_inline(db: AsyncSession, ctx: RequestContext) -> None:
    doc = await _upload(db, ctx, _PDF, "receipt.pdf", "application/pdf")

    download = await get_document_download(ctx, doc.id)
    assert download is not None
    assert (download.media_type, download.disposition) == ("application/pdf", "inline")


@pytest.mark.asyncio
async def test_a_photo_named_as_a_pdf_is_not_labelled_a_pdf(db: AsyncSession, ctx: RequestContext) -> None:
    doc = await _upload(db, ctx, photo_with_gps("JPEG"), "receipt.pdf", "application/pdf")

    assert doc.file_mime_type == OCTET_STREAM_MIME


@pytest.mark.asyncio
async def test_html_named_as_a_pdf_inside_a_zip_is_not_stored_as_a_pdf(
    db: AsyncSession, ctx: RequestContext,
) -> None:
    await accept_upload(ctx, _zip({"bill.pdf": _HTML, "real.pdf": _PDF}), "bills.zip", "application/zip")

    rows = (await db.execute(
        select(Document.file_name, Document.file_mime_type).where(Document.organization_id == ctx.organization_id),
    )).all()
    docs = {name: mime for name, mime in rows}
    assert docs == {"bill.pdf": OCTET_STREAM_MIME, "real.pdf": "application/pdf"}


@pytest.mark.asyncio
async def test_replacing_a_file_with_html_named_as_a_pdf_is_not_stored_or_served_as_html(
    db: AsyncSession, ctx: RequestContext,
) -> None:
    doc = await _upload(db, ctx, _PDF, "receipt.pdf", "application/pdf")
    # A file can only be replaced once it has been read.
    await db.execute(update(Document).where(Document.id == doc.id).values(status="completed"))
    await db.commit()

    await replace_file(ctx, doc.id, _HTML, "receipt.pdf", "text/html")

    # The patched unit of work doesn't commit; write the change so it can be read back.
    await db.commit()
    await db.refresh(doc)
    assert doc.file_mime_type == OCTET_STREAM_MIME
    assert _stored_content_types()[-1] == OCTET_STREAM_MIME
    download = await get_document_download(ctx, doc.id)
    assert download is not None
    assert download.media_type == OCTET_STREAM_MIME
    assert download.disposition.startswith("attachment")


@pytest.mark.asyncio
@pytest.mark.parametrize("stored_type", ["text/html", "image/svg+xml", "application/xhtml+xml"])
async def test_a_row_saved_with_a_web_page_type_is_served_as_a_download(
    db: AsyncSession, ctx: RequestContext, stored_type: str,
) -> None:
    doc = await _upload(db, ctx, _HTML, "invoice.pdf", "text/html")
    # A row written before the type was sniffed still carries the uploader's claim.
    await db.execute(update(Document).where(Document.id == doc.id).values(file_mime_type=stored_type))
    await db.commit()

    download = await get_document_download(ctx, doc.id)
    assert download is not None
    assert download.media_type == OCTET_STREAM_MIME
    assert download.disposition.startswith("attachment")


@pytest.mark.parametrize(("data", "header", "expected"), [
    # Markup is text: saved as text/plain, which a browser shows rather than runs.
    (_HTML, "text/html", "text/plain"),
    (b"\x00\x01binary", "text/html", OCTET_STREAM_MIME),
    (_PDF, "text/html", "application/pdf"),
], ids=["markup", "binary", "pdf"])
def test_an_emailed_attachment_is_saved_as_what_its_bytes_are(data: bytes, header: str, expected: str) -> None:
    attachment: Attachment = {"filename": "invoice.pdf", "content_type": header, "data": data}

    _, _, mime_type = _resolve_attachment_content(attachment)

    assert mime_type == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("stored_type", ["text/csv", "text/plain"])
async def test_a_row_saved_as_text_is_still_served_as_that_text_type(
    db: AsyncSession, ctx: RequestContext, stored_type: str,
) -> None:
    doc = await _upload(db, ctx, b"date,amount\n2026-01-01,12.50\n", "bank.csv", "text/csv")
    # A row written before the type was sniffed kept the browser's text/csv.
    await db.execute(update(Document).where(Document.id == doc.id).values(file_mime_type=stored_type))
    await db.commit()

    download = await get_document_download(ctx, doc.id)
    assert download is not None
    assert download.media_type == stored_type
