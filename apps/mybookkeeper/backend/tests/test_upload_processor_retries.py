"""The upload worker's handling of a failed Claude read, against the database.

A cut-off reply is final (the same document is cut off the same way), and a
read that never reached Claude because the rate limit outlasts its wait
budget puts the document back, due when the limit lifts, with no retry
charged.
"""
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from platform_shared.extraction import (
    ExtractionParseError,
    ExtractionTruncatedError,
    RateLimitPausedError,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.upload_processor_constants import UPLOAD_FAILURE_MESSAGES
from app.models.documents.document import Document
from app.models.extraction.extraction_failure_kind import ExtractionFailureKind
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.workers import upload_processor_worker as worker


@pytest.fixture()
def bound_db(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _session() -> AsyncIterator[AsyncSession]:
        yield db

    with (
        patch.object(worker, "AsyncSessionLocal", _session),
        patch.object(worker, "record_event", AsyncMock()),
    ):
        yield


async def _processing_doc(db: AsyncSession, user: User, org: Organization) -> Document:
    doc = Document(
        organization_id=org.id, user_id=user.id, file_name="invoice.pdf", file_type="pdf",
        status="processing", retry_count=0,
    )
    db.add(doc)
    await db.commit()
    return doc


@pytest.mark.usefixtures("bound_db")
class TestUploadRetries:
    async def test_a_cut_off_reply_fails_at_once_with_a_clear_reason(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        doc = await _processing_doc(db, test_user, test_org)

        with patch.object(worker, "process_document", AsyncMock(side_effect=ExtractionTruncatedError("cut off"))):
            assert await worker.process_one_for_user(test_user.id) is True

        await db.refresh(doc)
        assert doc.status == "failed"
        assert doc.retry_count == 0
        assert doc.error_message == UPLOAD_FAILURE_MESSAGES[ExtractionFailureKind.CUT_OFF]
        assert "won't help" in doc.error_message

    async def test_an_unreadable_reply_is_still_retried(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        doc = await _processing_doc(db, test_user, test_org)

        with patch.object(worker, "process_document", AsyncMock(side_effect=ExtractionParseError("not json"))):
            await worker.process_one_for_user(test_user.id)

        await db.refresh(doc)
        assert doc.status == "processing"
        assert doc.retry_count == 1
        assert doc.next_retry_at is not None

    async def test_a_read_held_back_by_the_rate_limit_is_requeued_uncharged_for_when_it_lifts(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        doc = await _processing_doc(db, test_user, test_org)
        before = datetime.now(timezone.utc)

        with patch.object(worker, "process_document", AsyncMock(side_effect=RateLimitPausedError(600))):
            assert await worker.process_one_for_user(test_user.id) is True

        await db.refresh(doc)
        assert doc.status == "processing"
        assert doc.retry_count == 0
        assert doc.error_message is None
        resume = doc.next_retry_at.replace(tzinfo=timezone.utc)
        assert before + timedelta(seconds=599) <= resume <= datetime.now(timezone.utc) + timedelta(seconds=600)
