"""Tests for document_upload_service validation logic."""
import io
import uuid
import zipfile
from contextlib import asynccontextmanager

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.upload_errors import upload_error_status
from app.models.documents.document import Document
from app.services.documents.document_upload_service import accept_upload
from app.core.context import RequestContext, worker_context
from app.core.storage import get_storage


def _make_ctx() -> RequestContext:
    return worker_context(uuid.uuid4(), uuid.uuid4())


def _wire_db(monkeypatch: pytest.MonkeyPatch, db: AsyncSession) -> None:
    """Point the service's ``unit_of_work`` at the test session."""
    @asynccontextmanager
    async def _fake_uow():
        yield db

    monkeypatch.setattr(
        "app.services.documents.document_upload_service.unit_of_work", _fake_uow,
    )


async def _stored(db: AsyncSession, result: dict) -> Document:
    doc = await db.get(Document, uuid.UUID(str(result["document_id"])))
    assert doc is not None
    return doc


class TestAcceptUploadValidation:
    @pytest.mark.anyio
    async def test_empty_file_rejected(self) -> None:
        ctx = _make_ctx()
        with pytest.raises(ValueError, match="File is empty"):
            await accept_upload(ctx, content=b"", filename="test.pdf", content_type="application/pdf")

    @pytest.mark.anyio
    async def test_legacy_doc_rejected_with_save_as_docx_message(self) -> None:
        ctx = _make_ctx()
        with pytest.raises(ValueError, match=r"Unsupported file type.*\.docx") as exc:
            await accept_upload(
                ctx, content=b"\xd0\xcf\x11\xe0", filename="Lease.doc", content_type="application/msword",
            )
        assert upload_error_status(str(exc.value)) == 415


@pytest.mark.asyncio
class TestReferenceOnlyUpload:
    """``reference_only`` decides whether the transaction extractor gets a look.

    An Electricity Facts Label describes a plan; it is not a payment. Letting
    the usual pipeline read one invents an expense against the property, which
    is why the utility-plan dialog could not upload at all before this flag
    existed.
    """

    async def test_a_reference_upload_is_flagged_so_the_extractor_skips_it(
        self, db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        result = await self._upload(db, monkeypatch, reference_only=True)

        doc = await _stored(db, result)
        # The same flag the Documents page exposes as "mark as reference-only",
        # which document_extraction_service short-circuits on before the model
        # is ever called.
        assert doc.is_escrow_paid is True
        assert doc.status == "processing"

    async def test_an_ordinary_upload_is_still_extracted(
        self, db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """The flag defaults off — every other caller keeps its transactions."""
        result = await self._upload(db, monkeypatch)

        assert (await _stored(db, result)).is_escrow_paid is False

    async def _upload(
        self,
        db: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
        **kwargs: bool,
    ) -> dict:
        _wire_db(monkeypatch, db)
        return await accept_upload(
            _make_ctx(),
            content=b"%PDF-1.4 electricity facts label",
            filename=f"efl-{uuid.uuid4()}.pdf",
            content_type="application/pdf",
            **kwargs,
        )


def _zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return buf.getvalue()


_RECEIPTS = _zip({"a.pdf": b"%PDF-1.4 receipt a", "b.pdf": b"%PDF-1.4 receipt b"})


async def _live_count(db: AsyncSession, ctx: RequestContext) -> int:
    return (await db.execute(
        select(func.count()).select_from(Document).where(
            Document.organization_id == ctx.organization_id, Document.deleted_at.is_(None),
        )
    )).scalar_one()


async def _set_batch_status(db: AsyncSession, batch_id: object, status: str) -> None:
    await db.execute(update(Document).where(Document.batch_id == batch_id).values(status=status))
    await db.flush()


@pytest.mark.asyncio
class TestZipResend:
    """The phone resends a file whose answer was lost; a zip must not be read twice."""

    async def _send(self, ctx: RequestContext, content: bytes = _RECEIPTS) -> dict:
        return await accept_upload(ctx, content=content, filename="receipts.zip", content_type="application/zip")

    async def test_resending_the_same_zip_creates_nothing_and_returns_the_first_answer(
        self, db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _wire_db(monkeypatch, db)
        ctx = _make_ctx()
        first = await self._send(ctx)
        stored_files = get_storage().upload_file.call_count

        again = await self._send(ctx)

        assert {k: again[k] for k in ("document_id", "batch_id", "batch_total")} == first
        assert await _live_count(db, ctx) == 2
        assert get_storage().upload_file.call_count == stored_files

    async def test_a_different_zip_is_its_own_batch(
        self, db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _wire_db(monkeypatch, db)
        ctx = _make_ctx()
        first = await self._send(ctx)

        other = await self._send(ctx, _zip({"c.pdf": b"%PDF-1.4 receipt c"}))

        assert other["batch_id"] != first["batch_id"]
        assert await _live_count(db, ctx) == 3

    async def test_the_same_zip_in_another_workspace_is_read_there(
        self, db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _wire_db(monkeypatch, db)
        mine, theirs = _make_ctx(), _make_ctx()
        first = await self._send(mine)

        elsewhere = await self._send(theirs)

        assert elsewhere["batch_id"] != first["batch_id"]
        assert await _live_count(db, theirs) == 2

    async def test_a_batch_that_partly_failed_is_still_the_answer(
        self, db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _wire_db(monkeypatch, db)
        ctx = _make_ctx()
        first = await self._send(ctx)
        await db.execute(
            update(Document).where(Document.id == uuid.UUID(str(first["document_id"]))).values(status="failed")
        )
        await db.flush()

        again = await self._send(ctx)

        assert again["batch_id"] == first["batch_id"]
        assert await _live_count(db, ctx) == 2

    async def test_a_batch_that_wholly_failed_is_replaced(
        self, db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _wire_db(monkeypatch, db)
        ctx = _make_ctx()
        first = await self._send(ctx)
        await _set_batch_status(db, first["batch_id"], "failed")

        again = await self._send(ctx)

        assert again["batch_id"] != first["batch_id"]
        assert "duplicate" not in again
        assert await _live_count(db, ctx) == 2

    async def test_a_zip_whose_batch_was_deleted_is_read_again(
        self, db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _wire_db(monkeypatch, db)
        ctx = _make_ctx()
        first = await self._send(ctx)
        await db.execute(
            update(Document).where(Document.batch_id == first["batch_id"])
            .values(status="deleted", deleted_at=func.now())
        )
        await db.flush()

        again = await self._send(ctx)

        assert again["batch_id"] != first["batch_id"]
        assert await _live_count(db, ctx) == 2
