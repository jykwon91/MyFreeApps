"""Tests for the batch progress counts behind the upload card."""
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.documents import document_repo


def _doc(org: Organization, user: User, batch_id: str, status: str) -> Document:
    return Document(
        organization_id=org.id,
        user_id=user.id,
        file_name=f"{uuid.uuid4().hex}.pdf",
        file_type="pdf",
        source="upload",
        status=status,
        batch_id=batch_id,
    )


@pytest.mark.asyncio
async def test_counts_each_status_in_the_batch(db: AsyncSession, test_user: User, test_org: Organization) -> None:
    batch_id = str(uuid.uuid4())
    for status in ("completed", "failed", "failed", "processing"):
        db.add(_doc(test_org, test_user, batch_id, status))
    db.add(_doc(test_org, test_user, str(uuid.uuid4()), "failed"))
    await db.commit()

    counts = await document_repo.get_batch_status_counts(db, test_org.id, batch_id)

    assert counts == {"completed": 1, "failed": 2, "processing": 1}


@pytest.mark.asyncio
async def test_leaves_out_documents_the_user_deleted(db: AsyncSession, test_user: User, test_org: Organization) -> None:
    batch_id = str(uuid.uuid4())
    kept = _doc(test_org, test_user, batch_id, "failed")
    deleted = _doc(test_org, test_user, batch_id, "failed")
    db.add_all([kept, deleted])
    await db.commit()
    await document_repo.bulk_delete(db, [deleted.id], test_org.id)
    await db.commit()

    counts = await document_repo.get_batch_status_counts(db, test_org.id, batch_id)

    assert counts == {"failed": 1}
