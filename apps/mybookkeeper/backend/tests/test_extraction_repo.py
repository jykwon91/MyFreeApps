import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documents.document import Document
from app.models.extraction.extraction import Extraction
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories import extraction_repo


async def _create_document(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> Document:
    doc = Document(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        file_name="test.pdf",
        status="completed",
        source="upload",
    )
    db.add(doc)
    await db.flush()
    return doc


async def _create_extraction(
    db: AsyncSession,
    document_id: uuid.UUID,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    status: str = "processing",
) -> Extraction:
    ext = Extraction(
        id=uuid.uuid4(),
        document_id=document_id,
        organization_id=org_id,
        user_id=user_id,
        status=status,
        document_type="invoice",
    )
    return await extraction_repo.create(db, ext)


class TestCreate:
    @pytest.mark.asyncio
    async def test_creates_and_returns_extraction(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        doc = await _create_document(db, test_org.id, test_user.id)
        ext = await _create_extraction(db, doc.id, test_org.id, test_user.id)

        assert ext.id is not None
        assert ext.document_id == doc.id
        assert ext.status == "processing"


class TestGetByDocument:
    @pytest.mark.asyncio
    async def test_returns_all_extractions_ordered_desc(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        doc = await _create_document(db, test_org.id, test_user.id)
        now = datetime.now(timezone.utc)
        ext1 = Extraction(
            id=uuid.uuid4(),
            document_id=doc.id,
            organization_id=test_org.id,
            user_id=test_user.id,
            status="completed",
            document_type="invoice",
            created_at=now - timedelta(minutes=5),
        )
        await extraction_repo.create(db, ext1)
        ext2 = Extraction(
            id=uuid.uuid4(),
            document_id=doc.id,
            organization_id=test_org.id,
            user_id=test_user.id,
            status="processing",
            document_type="invoice",
            created_at=now,
        )
        await extraction_repo.create(db, ext2)
        await db.commit()

        results = await extraction_repo.get_by_document(db, doc.id)
        assert len(results) == 2
        assert results[0].id == ext2.id
        assert results[1].id == ext1.id

    @pytest.mark.asyncio
    async def test_returns_empty_for_no_extractions(
        self, db: AsyncSession
    ) -> None:
        results = await extraction_repo.get_by_document(db, uuid.uuid4())
        assert len(results) == 0


class TestGetLatestByDocument:
    @pytest.mark.asyncio
    async def test_returns_most_recent(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        doc = await _create_document(db, test_org.id, test_user.id)
        now = datetime.now(timezone.utc)
        ext1 = Extraction(
            id=uuid.uuid4(),
            document_id=doc.id,
            organization_id=test_org.id,
            user_id=test_user.id,
            status="completed",
            document_type="invoice",
            created_at=now - timedelta(minutes=5),
        )
        await extraction_repo.create(db, ext1)
        ext2 = Extraction(
            id=uuid.uuid4(),
            document_id=doc.id,
            organization_id=test_org.id,
            user_id=test_user.id,
            status="processing",
            document_type="invoice",
            created_at=now,
        )
        await extraction_repo.create(db, ext2)
        await db.commit()

        latest = await extraction_repo.get_latest_by_document(db, doc.id)
        assert latest is not None
        assert latest.id == ext2.id

    @pytest.mark.asyncio
    async def test_returns_none_when_no_extractions(
        self, db: AsyncSession
    ) -> None:
        result = await extraction_repo.get_latest_by_document(db, uuid.uuid4())
        assert result is None


class TestUpdateStatus:
    @pytest.mark.asyncio
    async def test_updates_status(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        doc = await _create_document(db, test_org.id, test_user.id)
        ext = await _create_extraction(db, doc.id, test_org.id, test_user.id)

        await extraction_repo.update_status(db, ext, "completed")
        assert ext.status == "completed"
        assert ext.error_message is None

    @pytest.mark.asyncio
    async def test_updates_status_with_error(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        doc = await _create_document(db, test_org.id, test_user.id)
        ext = await _create_extraction(db, doc.id, test_org.id, test_user.id)

        await extraction_repo.update_status(db, ext, "failed", "Something went wrong")
        assert ext.status == "failed"
        assert ext.error_message == "Something went wrong"
