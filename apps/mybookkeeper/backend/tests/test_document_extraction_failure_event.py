"""A failed extraction still raises, and a lost failure event is logged, not swallowed.

The error's text never lands on the document: the upload worker stores the
reason users see when it handles the raise.
"""
from __future__ import annotations

import logging
from unittest.mock import AsyncMock, patch

import pytest
from app.models.documents.document import Document
from app.services.extraction.document_extraction_service import process_document
from sqlalchemy.ext.asyncio import AsyncSession

from tests.document_support import (
    make_document,
    mock_session_factory,
    setup_org_and_user,
)

MODULE = "app.services.extraction.document_extraction_service"


async def _processing_document(db: AsyncSession) -> Document:
    user, org_id = await setup_org_and_user(db)
    doc = make_document(org_id, user.id, status="processing")
    db.add(doc)
    await db.commit()
    return doc


async def _run_failing_extraction(
    db: AsyncSession, record_event: AsyncMock, doc: Document | None = None,
) -> None:
    if doc is None:
        doc = await _processing_document(db)
    fake_session, fake_uow = mock_session_factory(db)
    with (
        patch(f"{MODULE}.AsyncSessionLocal", fake_session),
        patch(f"{MODULE}.unit_of_work", fake_uow),
        patch(f"{MODULE}.extract_text_from_pdf", new_callable=AsyncMock, return_value="x" * 80),
        patch(f"{MODULE}.extract_from_text", side_effect=ValueError("Claude could not read it")),
        patch(f"{MODULE}.resolve_property_id", new_callable=AsyncMock, return_value=None),
        patch(f"{MODULE}.record_event", record_event),
    ):
        await process_document(doc.id)


@pytest.mark.asyncio
async def test_a_lost_failure_event_is_logged_and_the_extraction_error_still_raises(
    db: AsyncSession, caplog: pytest.LogCaptureFixture,
) -> None:
    record_event = AsyncMock(side_effect=RuntimeError("event store down"))

    with caplog.at_level(logging.ERROR, logger=MODULE), pytest.raises(ValueError, match="Claude could not read it"):
        await _run_failing_extraction(db, record_event)

    lost = [r for r in caplog.records if "extraction_failed" in r.getMessage()]
    assert len(lost) == 1
    assert lost[0].exc_info is not None
    assert "Claude could not read it" not in lost[0].getMessage()


@pytest.mark.asyncio
async def test_the_failure_event_is_recorded_when_the_store_is_up(db: AsyncSession) -> None:
    record_event = AsyncMock()

    with pytest.raises(ValueError):
        await _run_failing_extraction(db, record_event)

    record_event.assert_awaited_once()


@pytest.mark.asyncio
async def test_the_error_text_is_not_stored_on_the_document(db: AsyncSession) -> None:
    doc = await _processing_document(db)

    with pytest.raises(ValueError):
        await _run_failing_extraction(db, AsyncMock(), doc)

    await db.refresh(doc)
    assert doc.status == "failed"
    assert doc.error_message is None
