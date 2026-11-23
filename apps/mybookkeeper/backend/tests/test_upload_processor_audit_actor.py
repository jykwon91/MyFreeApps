"""What the upload worker writes for a user is audited as that user.

Without it the audit rows carry no actor, so deleting the account would leave
them behind (the erasure finds a user's history by ``changed_by``).
"""
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from platform_shared.core.audit import current_user_id
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.extraction import ExtractionParseError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documents.document import Document
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


@pytest.mark.usefixtures("bound_db", "audit_listeners")
async def test_the_workers_document_updates_are_audited_as_the_uploader(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    doc = Document(
        organization_id=test_org.id, user_id=test_user.id, file_name="invoice.pdf", file_type="pdf",
        status="processing", retry_count=0,
    )
    db.add(doc)
    await db.commit()

    with patch.object(worker, "process_document", AsyncMock(side_effect=ExtractionParseError("not json"))):
        assert await worker.process_one_for_user(test_user.id) is True

    updates = (await db.execute(
        select(AuditLog).where(
            AuditLog.table_name == "documents",
            AuditLog.record_id == str(doc.id),
            AuditLog.operation == "UPDATE",
        ),
    )).scalars().all()
    assert {row.field_name for row in updates} >= {"retry_count", "status"}
    assert {row.changed_by for row in updates} == {str(test_user.id)}
    assert current_user_id.get() is None
