"""Tests for document_upload_service validation logic."""
import uuid
from contextlib import asynccontextmanager

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documents.document import Document
from app.services.documents.document_upload_service import accept_upload
from app.core.context import worker_context


def _make_ctx() -> "RequestContext":
    from app.core.context import RequestContext
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
