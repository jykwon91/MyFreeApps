"""The extraction worker honours a delete or reference-only mark made mid-read, and keeps cited duplicates."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.document_constants import EXTRACTION_TIMEOUT_SECONDS, STALE_EXTRACTION_MARGIN_SECONDS
from app.models.documents.document import Document
from app.models.extraction.extraction import Extraction
from app.models.organization.organization_member import OrgRole
from app.models.system.usage_log import UsageLog
from app.models.transactions.transaction import Transaction
from app.services.documents import document_service
from app.services.extraction.dedup_service import DedupDecision
from app.services.extraction.document_extraction_service import process_document
from tests.document_support import (
    make_document,
    mock_session_factory,
    setup_org_and_user,
    single_invoice_extraction,
)

MODULE = "app.services.extraction.document_extraction_service"
CREATE = DedupDecision(action="create", reason="new")
SKIP = DedupDecision(action="skip", reason="same as an existing record")


async def _process(db: AsyncSession, doc_id, *, during_read=None, extraction=None, decisions=(CREATE,)):
    """Run process_document, calling ``during_read`` while Claude 'is reading'."""
    fake_session, fake_uow = mock_session_factory(db)

    async def claude(*_args, **_kwargs) -> dict:
        if during_read:
            await during_read()
        return extraction or single_invoice_extraction()

    with (
        patch(f"{MODULE}.AsyncSessionLocal", fake_session),
        patch(f"{MODULE}.unit_of_work", fake_uow),
        patch(f"{MODULE}.extract_text_from_pdf", new_callable=AsyncMock, return_value="x" * 80),
        patch(f"{MODULE}.extract_from_text", side_effect=claude),
        patch(f"{MODULE}.resolve_property_id", new_callable=AsyncMock, return_value=None),
        patch(f"{MODULE}.evaluate_dedup", new_callable=AsyncMock, side_effect=list(decisions)),
    ):
        return await process_document(doc_id)


async def _add_document(db: AsyncSession, status: str) -> tuple[Document, RequestContext]:
    user, org_id = await setup_org_and_user(db)
    doc = make_document(org_id, user.id, status=status)
    db.add(doc)
    await db.commit()
    return doc, RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.OWNER)


async def _row(db: AsyncSession, doc_id, *columns):
    return (await db.execute(select(*columns).where(Document.id == doc_id))).one()


@pytest.mark.asyncio
async def test_results_are_discarded_for_a_document_deleted_mid_read(db: AsyncSession) -> None:
    doc, ctx = await _add_document(db, "extracting")
    stale = datetime.now(timezone.utc) - timedelta(
        seconds=EXTRACTION_TIMEOUT_SECONDS + STALE_EXTRACTION_MARGIN_SECONDS + 60,
    )
    await db.execute(update(Document).where(Document.id == doc.id).values(updated_at=stale))
    await db.commit()
    _, fake_uow = mock_session_factory(db)

    async def delete_through_the_service() -> None:
        with patch("app.services.documents.document_service.unit_of_work", fake_uow):
            result = await document_service.delete_documents(ctx, [doc.id])
        assert result.deleted == [doc.id]
        await db.commit()

    result = await _process(db, doc.id, during_read=delete_through_the_service)

    assert result.discarded
    status, deleted_at = await _row(db, doc.id, Document.status, Document.deleted_at)
    assert status == "deleted" and deleted_at is not None
    assert (await db.execute(select(Transaction))).scalars().all() == []
    assert (await db.execute(select(Extraction))).scalars().all() == []
    # Claude was already paid for.
    assert len((await db.execute(select(UsageLog))).scalars().all()) == 1


@pytest.mark.asyncio
async def test_a_document_deleted_before_the_worker_starts_is_skipped(db: AsyncSession) -> None:
    doc, _ = await _add_document(db, "processing")
    await db.execute(update(Document).where(Document.id == doc.id).values(
        status="deleted", deleted_at=datetime.now(timezone.utc),
    ))
    await db.commit()

    async def never() -> None:
        raise AssertionError("Claude must not be called for a deleted document")

    result = await _process(db, doc.id, during_read=never)

    assert result.discarded
    assert (await db.execute(select(Transaction))).scalars().all() == []


@pytest.mark.asyncio
async def test_results_are_discarded_for_a_document_marked_reference_only_mid_read(db: AsyncSession) -> None:
    doc, _ = await _add_document(db, "extracting")

    async def mark_it() -> None:
        await db.execute(update(Document).where(Document.id == doc.id).values(is_escrow_paid=True))
        await db.commit()

    result = await _process(db, doc.id, during_read=mark_it)

    assert result.discarded
    status, escrow_paid = await _row(db, doc.id, Document.status, Document.is_escrow_paid)
    assert status == "completed" and escrow_paid is True
    assert (await db.execute(select(Transaction))).scalars().all() == []
    assert (await db.execute(select(Extraction))).scalars().all() == []
    assert len((await db.execute(select(UsageLog))).scalars().all()) == 1


def _two_invoice_extraction() -> dict:
    extraction = single_invoice_extraction()
    second = dict(extraction["data"][0], vendor="XYZ Electric", amount="90.00")
    extraction["data"] = [extraction["data"][0], second]
    return extraction


@pytest.mark.asyncio
async def test_a_pure_duplicate_is_hidden_without_wiping_its_bytes(db: AsyncSession) -> None:
    doc, _ = await _add_document(db, "extracting")

    result = await _process(db, doc.id, decisions=(SKIP,))

    assert not result.discarded
    status, deleted_at, content = await _row(
        db, doc.id, Document.status, Document.deleted_at, Document.file_content,
    )
    assert status == "deleted" and deleted_at is not None
    assert content == b"fake-pdf-content"


@pytest.mark.asyncio
async def test_a_mixed_extraction_keeps_its_document_live_and_readable(db: AsyncSession) -> None:
    doc, _ = await _add_document(db, "extracting")

    await _process(db, doc.id, extraction=_two_invoice_extraction(), decisions=(SKIP, CREATE))

    status, deleted_at, content = await _row(
        db, doc.id, Document.status, Document.deleted_at, Document.file_content,
    )
    assert status == "completed" and deleted_at is None
    assert content == b"fake-pdf-content"
    assert len((await db.execute(select(Transaction))).scalars().all()) == 1
