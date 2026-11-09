"""Fixtures shared by the document extraction and delete tests."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.user.user import User


async def setup_org_and_user(db: AsyncSession) -> tuple[User, uuid.UUID]:
    user = User(
        id=uuid.uuid4(),
        email=f"test-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    org = Organization(id=uuid.uuid4(), name="Test Org", created_by=user.id)
    db.add(org)
    await db.commit()
    await db.refresh(user)
    await db.refresh(org)
    return user, org.id


def make_document(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    status: str = "processing",
    file_type: str = "pdf",
    property_id: uuid.UUID | None = None,
) -> Document:
    return Document(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=property_id,
        status=status,
        file_name="test.pdf",
        file_type=file_type,
        file_content=b"fake-pdf-content",
        file_mime_type="application/pdf",
        source="upload",
    )


def single_invoice_extraction() -> dict:
    """Claude extraction response for a single invoice."""
    return {
        "data": [
            {
                "vendor": "ABC Plumbing",
                "date": "2025-06-15",
                "amount": "250.00",
                "description": "Pipe repair",
                "tags": ["maintenance"],
                "tax_relevant": True,
                "confidence": "high",
                "document_type": "invoice",
                "address": "123 Main St",
                "channel": None,
                "line_items": None,
            }
        ],
        "tokens": 500,
    }


def mock_session_factory(db: AsyncSession):
    """Create a context manager mock that yields the test session for both
    AsyncSessionLocal and unit_of_work."""

    class FakeSession:
        def __init__(self) -> None:
            self._session = db

        async def __aenter__(self):
            return self._session

        async def __aexit__(self, *args):
            pass

    class FakeUnitOfWork:
        async def __aenter__(self):
            return db

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            if exc_type is None:
                await db.flush()

    return FakeSession, FakeUnitOfWork
