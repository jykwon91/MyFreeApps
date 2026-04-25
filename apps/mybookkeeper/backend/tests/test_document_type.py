import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.mappers.extraction_mapper import MappedItem
from app.models.documents.document import Document
from app.schemas.documents.document import DocumentRead
from app.services.extraction.document_extraction_service import (
    _apply_mapped_item_to_doc,
    _create_doc_from_item,
)


def make_mapped_item(
    document_type: str = "invoice",
    property_id: uuid.UUID | None = None,
) -> MappedItem:
    return MappedItem(
        vendor="Acme Repairs",
        date=None,
        amount=Decimal("250.00"),
        description="Plumbing fix",
        tags=["maintenance"],
        tax_relevant=True,
        channel=None,
        address=None,
        document_type=document_type,
        line_items=None,
        confidence="high",
        property_id=property_id,
        status="approved",
        review_fields=[],
        review_reason=None,
        raw_data={},
    )


def make_document(
    user_id: uuid.UUID | None = None,
    organization_id: uuid.UUID | None = None,
    document_type: str | None = None,
) -> Document:
    return Document(
        id=uuid.uuid4(),
        user_id=user_id or uuid.uuid4(),
        organization_id=organization_id or uuid.uuid4(),
        file_name="test.pdf",
        file_type="pdf",
        document_type=document_type,
        source="upload",
        status="processing",
    )

class TestDocumentReadSchema:
    def test_includes_document_type_field(self) -> None:
        obj = SimpleNamespace(
            id=uuid.uuid4(), user_id=uuid.uuid4(), property_id=None,
            created_at="2025-01-01T00:00:00Z", updated_at="2025-01-01T00:00:00Z",
            file_name="invoice.pdf", file_type="pdf", document_type="invoice",
            file_mime_type="application/pdf", email_message_id=None,
            external_id=None, external_source=None, source="upload",
            status="completed", error_message=None, batch_id=None, deleted_at=None,
        )
        result = DocumentRead.model_validate(obj)
        assert result.document_type == "invoice"

    def test_document_type_can_be_null(self) -> None:
        obj = SimpleNamespace(
            id=uuid.uuid4(), user_id=uuid.uuid4(), property_id=None,
            created_at="2025-01-01T00:00:00Z", updated_at="2025-01-01T00:00:00Z",
            file_name="scan.pdf", file_type="pdf", document_type=None,
            file_mime_type="application/pdf", email_message_id=None,
            external_id=None, external_source=None, source="upload",
            status="completed", error_message=None, batch_id=None, deleted_at=None,
        )
        result = DocumentRead.model_validate(obj)
        assert result.document_type is None

    def test_document_type_serializes_in_model_dump(self) -> None:
        obj = SimpleNamespace(
            id=uuid.uuid4(), user_id=uuid.uuid4(), property_id=None,
            created_at="2025-01-01T00:00:00Z", updated_at="2025-01-01T00:00:00Z",
            file_name="receipt.pdf", file_type="pdf", document_type="receipt",
            file_mime_type="application/pdf", email_message_id=None,
            external_id=None, external_source=None, source="upload",
            status="completed", error_message=None, batch_id=None, deleted_at=None,
        )
        result = DocumentRead.model_validate(obj)
        data = result.model_dump()
        assert "document_type" in data
        assert data["document_type"] == "receipt"


class TestApplyMappedItemToDoc:
    def test_sets_document_type_from_item(self) -> None:
        doc = make_document()
        item = make_mapped_item(document_type="lease")
        _apply_mapped_item_to_doc(doc, item)
        assert doc.document_type == "lease"

    def test_sets_status_to_completed(self) -> None:
        doc = make_document()
        item = make_mapped_item(document_type="invoice")
        _apply_mapped_item_to_doc(doc, item)
        assert doc.status == "completed"

    def test_sets_property_id_from_item(self) -> None:
        prop_id = uuid.uuid4()
        doc = make_document()
        item = make_mapped_item(document_type="invoice", property_id=prop_id)
        _apply_mapped_item_to_doc(doc, item)
        assert doc.property_id == prop_id

    def test_clears_property_id_when_item_has_none(self) -> None:
        doc = make_document()
        doc.property_id = uuid.uuid4()
        item = make_mapped_item(document_type="receipt", property_id=None)
        _apply_mapped_item_to_doc(doc, item)
        assert doc.property_id is None

    def test_year_end_statement_document_type(self) -> None:
        doc = make_document()
        item = make_mapped_item(document_type="year_end_statement")
        _apply_mapped_item_to_doc(doc, item)
        assert doc.document_type == "year_end_statement"

    def test_overwrites_existing_document_type(self) -> None:
        doc = make_document(document_type="invoice")
        item = make_mapped_item(document_type="receipt")
        _apply_mapped_item_to_doc(doc, item)
        assert doc.document_type == "receipt"

class TestCreateDocFromItem:
    def test_creates_document_with_document_type(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        item = make_mapped_item(document_type="statement")
        doc = _create_doc_from_item(
            item, org_id, user_id, "statement.pdf", "pdf", b"content", "application/pdf",
        )
        assert doc.document_type == "statement"

    def test_document_type_empty_string_propagates(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        item = make_mapped_item(document_type="")
        doc = _create_doc_from_item(
            item, org_id, user_id, "unknown.pdf", "pdf", b"data", "application/pdf",
        )
        assert doc.document_type == ""

    def test_creates_document_with_correct_user_and_org(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        item = make_mapped_item(document_type="invoice")
        doc = _create_doc_from_item(
            item, org_id, user_id, "inv.pdf", "pdf", b"data", "application/pdf",
        )
        assert doc.organization_id == org_id
        assert doc.user_id == user_id

    def test_creates_document_with_status_completed(self) -> None:
        item = make_mapped_item(document_type="invoice")
        doc = _create_doc_from_item(
            item, uuid.uuid4(), uuid.uuid4(), "inv.pdf", "pdf", b"data", "application/pdf",
        )
        assert doc.status == "completed"

    def test_propagates_property_id_from_item(self) -> None:
        prop_id = uuid.uuid4()
        item = make_mapped_item(document_type="receipt", property_id=prop_id)
        doc = _create_doc_from_item(
            item, uuid.uuid4(), uuid.uuid4(), "rec.pdf", "pdf", b"data", "application/pdf",
        )
        assert doc.property_id == prop_id

    def test_property_id_is_none_when_not_set(self) -> None:
        item = make_mapped_item(document_type="receipt", property_id=None)
        doc = _create_doc_from_item(
            item, uuid.uuid4(), uuid.uuid4(), "rec.pdf", "pdf", b"data", "application/pdf",
        )
        assert doc.property_id is None

class TestDocumentModelPersistence:

    async def _make_user_and_org(self, db: AsyncSession, email: str) -> tuple:
        from app.models.user.user import User
        from app.models.organization.organization import Organization
        user = User(
            id=uuid.uuid4(), email=email,
            hashed_password="fakehash", is_active=True,
            is_superuser=False, is_verified=True,
        )
        db.add(user)
        await db.flush()
        org = Organization(id=uuid.uuid4(), name=f"{email} org", created_by=user.id)
        db.add(org)
        await db.flush()
        return user, org

    @pytest.mark.asyncio
    async def test_document_type_persists_to_database(self, db: AsyncSession) -> None:
        user, org = await self._make_user_and_org(db, "doctype-test@example.com")
        doc = Document(
            id=uuid.uuid4(), user_id=user.id, organization_id=org.id,
            file_name="invoice.pdf", file_type="pdf",
            document_type="invoice", source="upload", status="processing",
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        assert doc.document_type == "invoice"

    @pytest.mark.asyncio
    async def test_document_type_can_be_null_in_database(self, db: AsyncSession) -> None:
        user, org = await self._make_user_and_org(db, "doctype-null@example.com")
        doc = Document(
            id=uuid.uuid4(), user_id=user.id, organization_id=org.id,
            file_name="unknown.pdf", file_type="pdf",
            document_type=None, source="upload", status="processing",
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        assert doc.document_type is None

    @pytest.mark.asyncio
    async def test_document_type_can_be_updated(self, db: AsyncSession) -> None:
        user, org = await self._make_user_and_org(db, "doctype-update@example.com")
        doc = Document(
            id=uuid.uuid4(), user_id=user.id, organization_id=org.id,
            file_name="doc.pdf", document_type=None,
            source="upload", status="processing",
        )
        db.add(doc)
        await db.commit()
        doc.document_type = "receipt"
        await db.commit()
        await db.refresh(doc)
        assert doc.document_type == "receipt"

    @pytest.mark.asyncio
    async def test_document_type_max_length_accepted(self, db: AsyncSession) -> None:
        user, org = await self._make_user_and_org(db, "doctype-len@example.com")
        long_type = "a" * 50
        doc = Document(
            id=uuid.uuid4(), user_id=user.id, organization_id=org.id,
            file_name="doc.pdf", document_type=long_type,
            source="upload", status="processing",
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        assert doc.document_type == long_type
