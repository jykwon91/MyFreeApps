"""Tests for demo user management — create, reset, delete, list, documents, and tax docs."""

import io
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_document import TransactionDocument
from app.models.user.user import User
from app.repositories.demo import demo_repo
from app.services.demo import demo_service
from app.services.demo.demo_constants import (
    DEMO_DOCUMENTS,
    DEMO_TAX_DOCUMENTS,
    DEMO_TRANSACTIONS,
    make_demo_email,
)
from app.services.demo.demo_pdf_generator import (
    DemoDocumentPdfGenerator,
    DemoTaxPdfGenerator,
)


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    """Route demo_service's AsyncSessionLocal and unit_of_work to the test DB session.

    Also mocks the recompute call since it opens its own unit_of_work
    and uses multiple repo/service dependencies that would need separate patching.
    Recompute logic is tested independently in tax recompute tests.
    """
    @asynccontextmanager
    async def _fake_session():
        yield db

    @asynccontextmanager
    async def _fake_uow():
        yield db

    async def _fake_recompute(org_id, tax_return_id):
        return 0

    with (
        patch("app.services.demo.demo_service.AsyncSessionLocal", _fake_session),
        patch("app.services.demo.demo_service.unit_of_work", _fake_uow),
        patch("app.services.demo.demo_service.tax_recompute_service.recompute", _fake_recompute),
    ):
        yield


class TestDemoRepo:
    @pytest.mark.asyncio
    async def test_get_user_by_email_not_found(self, db: AsyncSession) -> None:
        result = await demo_repo.get_user_by_email(db, "nonexistent@test.com")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_user_by_email_found(self, db: AsyncSession) -> None:
        email = make_demo_email("repo-test")
        user = User(
            email=email,
            hashed_password="fakehash",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        db.add(user)
        await db.commit()
        result = await demo_repo.get_user_by_email(db, email)
        assert result is not None
        assert result.email == email

    @pytest.mark.asyncio
    async def test_count_demo_data_empty(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        counts = await demo_repo.count_demo_data(db, test_org.id)
        assert counts["properties"] == 0
        assert counts["transactions"] == 0
        assert counts["documents"] == 0
        assert counts["tax_returns"] == 0


class TestDemoServiceCreateDemoUser:
    @pytest.mark.asyncio
    async def test_create_demo_user_success(self, db: AsyncSession) -> None:
        result = await demo_service.create_demo_user("acme-corp")
        assert "acme-corp" in result.message.lower()
        assert "demo+acme-corp@mybookkeeper.com" == result.credentials.email
        assert len(result.credentials.password) > 10

    @pytest.mark.asyncio
    async def test_create_demo_user_sets_is_demo_flag(self, db: AsyncSession) -> None:
        await demo_service.create_demo_user("test-co")
        user = await demo_repo.get_user_by_email(db, "demo+test-co@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None
        assert org.is_demo is True
        assert org.demo_tag == "test-co"

    @pytest.mark.asyncio
    async def test_create_demo_user_creates_seed_data(self, db: AsyncSession) -> None:
        await demo_service.create_demo_user("seed-test")
        user = await demo_repo.get_user_by_email(db, "demo+seed-test@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None
        counts = await demo_repo.count_demo_data(db, org.id)
        assert counts["properties"] == 3
        assert counts["transactions"] == len(DEMO_TRANSACTIONS)
        assert counts["documents"] == len(DEMO_DOCUMENTS) + len(DEMO_TAX_DOCUMENTS)
        assert counts["tax_returns"] == 1

    @pytest.mark.asyncio
    async def test_create_demo_user_duplicate_raises(self, db: AsyncSession) -> None:
        await demo_service.create_demo_user("dup-test")
        with pytest.raises(ValueError, match="already exists"):
            await demo_service.create_demo_user("dup-test")


class TestDemoServiceListDemoUsers:
    @pytest.mark.asyncio
    async def test_list_empty(self, db: AsyncSession) -> None:
        result = await demo_service.list_demo_users()
        assert result.total == 0
        assert result.users == []

    @pytest.mark.asyncio
    async def test_list_returns_tagged_users(self, db: AsyncSession) -> None:
        await demo_service.create_demo_user("alpha")
        await demo_service.create_demo_user("beta")
        result = await demo_service.list_demo_users()
        assert result.total == 2
        emails = {u.email for u in result.users}
        assert "demo+alpha@mybookkeeper.com" in emails
        assert "demo+beta@mybookkeeper.com" in emails


class TestDemoServiceDeleteDemoUser:
    @pytest.mark.asyncio
    async def test_delete_removes_user(self, db: AsyncSession) -> None:
        created = await demo_service.create_demo_user("to-delete")
        user = await demo_repo.get_user_by_email(db, created.credentials.email)
        assert user is not None
        result = await demo_service.delete_demo_user(user.id)
        assert "deleted" in result.message.lower()
        gone = await demo_repo.get_user_by_email(db, created.credentials.email)
        assert gone is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_raises_lookup(self, db: AsyncSession) -> None:
        with pytest.raises(LookupError):
            await demo_service.delete_demo_user(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_delete_non_demo_org_raises_value_error(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Deleting a user whose org is not marked as demo should raise ValueError."""
        with pytest.raises(ValueError, match="demo organization"):
            await demo_service.delete_demo_user(test_user.id)


class TestDemoServiceResetDemoUser:
    @pytest.mark.asyncio
    async def test_reset_user_returns_new_password(self, db: AsyncSession) -> None:
        created = await demo_service.create_demo_user("reset-me")
        user = await demo_repo.get_user_by_email(db, created.credentials.email)
        assert user is not None
        result = await demo_service.reset_demo_user(user.id)
        assert result.email == created.credentials.email
        assert len(result.password) > 10
        assert "reset" in result.message.lower()

    @pytest.mark.asyncio
    async def test_reset_user_reseeds_data(self, db: AsyncSession) -> None:
        created = await demo_service.create_demo_user("reseed-me")
        user = await demo_repo.get_user_by_email(db, created.credentials.email)
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None
        await demo_service.reset_demo_user(user.id)
        counts = await demo_repo.count_demo_data(db, org.id)
        assert counts["properties"] == 3
        assert counts["transactions"] == len(DEMO_TRANSACTIONS)
        assert counts["documents"] == len(DEMO_DOCUMENTS) + len(DEMO_TAX_DOCUMENTS)
        assert counts["tax_returns"] == 1

    @pytest.mark.asyncio
    async def test_reset_user_nonexistent_raises_lookup(self, db: AsyncSession) -> None:
        with pytest.raises(LookupError):
            await demo_service.reset_demo_user(uuid.uuid4())

    @pytest.mark.asyncio
    async def test_reset_non_demo_org_raises_value_error(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Resetting a user whose org is not marked as demo should raise ValueError."""
        with pytest.raises(ValueError, match="demo organization"):
            await demo_service.reset_demo_user(test_user.id)


class TestDemoDocuments:
    @pytest.mark.asyncio
    async def test_documents_linked_to_transactions(self, db: AsyncSession) -> None:
        """Verify that demo documents are created and linked to transactions."""
        await demo_service.create_demo_user("doc-link-test")
        user = await demo_repo.get_user_by_email(db, "demo+doc-link-test@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None

        link_count_result = await db.execute(
            select(func.count()).select_from(TransactionDocument)
            .join(Document, TransactionDocument.document_id == Document.id)
            .where(Document.organization_id == org.id)
        )
        link_count = link_count_result.scalar_one()
        assert link_count > 0, "Expected transaction-document links to be created"

    @pytest.mark.asyncio
    async def test_documents_have_completed_status(self, db: AsyncSession) -> None:
        """All seeded documents should have completed status."""
        await demo_service.create_demo_user("doc-status-test")
        user = await demo_repo.get_user_by_email(db, "demo+doc-status-test@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None

        result = await db.execute(
            select(Document.status)
            .where(Document.organization_id == org.id)
        )
        statuses = result.scalars().all()
        assert all(s == "completed" for s in statuses)

    @pytest.mark.asyncio
    async def test_utility_transactions_have_sub_category(self, db: AsyncSession) -> None:
        """Verify utility transactions have the correct sub_category set."""
        await demo_service.create_demo_user("util-sub-test")
        user = await demo_repo.get_user_by_email(db, "demo+util-sub-test@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None

        result = await db.execute(
            select(Transaction.sub_category)
            .where(
                Transaction.organization_id == org.id,
                Transaction.category == "utilities",
                Transaction.deleted_at.is_(None),
            )
        )
        sub_categories = set(result.scalars().all())
        expected = {"electricity", "water", "gas", "internet"}
        assert sub_categories == expected, f"Expected {expected}, got {sub_categories}"

    @pytest.mark.asyncio
    async def test_all_12_months_covered(self, db: AsyncSession) -> None:
        """Verify transactions span all 12 months of 2025."""
        await demo_service.create_demo_user("months-test")
        user = await demo_repo.get_user_by_email(db, "demo+months-test@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None

        result = await db.execute(
            select(func.extract("month", Transaction.transaction_date).label("m"))
            .where(
                Transaction.organization_id == org.id,
                Transaction.deleted_at.is_(None),
            )
            .distinct()
        )
        months = {int(row[0]) for row in result.all()}
        assert months == set(range(1, 13)), f"Missing months: {set(range(1, 13)) - months}"


class TestDemoTaxDocuments:
    @pytest.mark.asyncio
    async def test_tax_documents_have_file_content(self, db: AsyncSession) -> None:
        """Tax document PDFs should have actual file content (bytes)."""
        await demo_service.create_demo_user("taxdoc-test")
        user = await demo_repo.get_user_by_email(db, "demo+taxdoc-test@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None

        # Filter by the exact file names from DEMO_TAX_DOCUMENTS to distinguish
        # from regular transaction documents that share document_type values
        tax_doc_filenames = [d["file_name"] for d in DEMO_TAX_DOCUMENTS]
        result = await db.execute(
            select(Document)
            .where(
                Document.organization_id == org.id,
                Document.file_name.in_(tax_doc_filenames),
            )
        )
        tax_docs = result.scalars().all()
        assert len(tax_docs) == len(DEMO_TAX_DOCUMENTS)

        for doc in tax_docs:
            content = await db.execute(
                select(Document.file_content).where(Document.id == doc.id)
            )
            file_bytes = content.scalar_one()
            assert file_bytes is not None, f"Tax doc {doc.file_name} has no file content"
            assert len(file_bytes) > 100, f"Tax doc {doc.file_name} PDF is suspiciously small"
            assert file_bytes[:5] == b"%PDF-", f"Tax doc {doc.file_name} is not a valid PDF"

    @pytest.mark.asyncio
    async def test_tax_documents_linked_to_properties(self, db: AsyncSession) -> None:
        """Tax documents should be linked to the correct properties."""
        await demo_service.create_demo_user("taxdoc-prop-test")
        user = await demo_repo.get_user_by_email(db, "demo+taxdoc-prop-test@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None

        # Tax docs with a property_index should be linked to a property
        property_linked_types = ["1099_k", "1099_misc", "1098", "tax_document", "insurance_statement"]
        result = await db.execute(
            select(Document)
            .where(
                Document.organization_id == org.id,
                Document.document_type.in_(property_linked_types),
            )
        )
        tax_docs = result.scalars().all()
        for doc in tax_docs:
            assert doc.property_id is not None, f"Tax doc {doc.file_name} has no property link"

        # W-2 is org-level (no property link)
        w2_result = await db.execute(
            select(Document)
            .where(
                Document.organization_id == org.id,
                Document.document_type == "w2",
            )
        )
        w2_docs = w2_result.scalars().all()
        for doc in w2_docs:
            assert doc.property_id is None, f"W-2 {doc.file_name} should not be linked to a property"


class TestDemoTaxPipelineWiring:
    """Verify that demo tax documents are wired into the tax pipeline via form instances."""

    @pytest.mark.asyncio
    async def test_extracted_form_instances_created(self, db: AsyncSession) -> None:
        """Creating a demo user should produce TaxFormInstance records for 1099-K, 1099-MISC, 1098."""
        await demo_service.create_demo_user("pipeline-test")
        user = await demo_repo.get_user_by_email(db, "demo+pipeline-test@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None

        result = await db.execute(
            select(TaxReturn).where(TaxReturn.organization_id == org.id)
        )
        tax_return = result.scalar_one()

        instances_result = await db.execute(
            select(TaxFormInstance)
            .where(
                TaxFormInstance.tax_return_id == tax_return.id,
                TaxFormInstance.source_type == "extracted",
            )
            .options(selectinload(TaxFormInstance.fields))
        )
        instances = instances_result.scalars().all()

        form_names = {inst.form_name for inst in instances}
        assert "1099_k" in form_names, "Missing 1099-K form instance"
        assert "1099_misc" in form_names, "Missing 1099-MISC form instance"
        assert "1098" in form_names, "Missing 1098 form instance"
        assert "w2" in form_names, "Missing W-2 form instance"

    @pytest.mark.asyncio
    async def test_form_instances_linked_to_documents(self, db: AsyncSession) -> None:
        """Each extracted form instance should have a document_id pointing to a real Document."""
        await demo_service.create_demo_user("doc-link-pipe")
        user = await demo_repo.get_user_by_email(db, "demo+doc-link-pipe@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None

        result = await db.execute(
            select(TaxReturn).where(TaxReturn.organization_id == org.id)
        )
        tax_return = result.scalar_one()

        instances_result = await db.execute(
            select(TaxFormInstance)
            .where(
                TaxFormInstance.tax_return_id == tax_return.id,
                TaxFormInstance.source_type == "extracted",
            )
        )
        instances = instances_result.scalars().all()

        for inst in instances:
            assert inst.document_id is not None, f"{inst.form_name} has no document_id"
            doc_result = await db.execute(
                select(Document).where(Document.id == inst.document_id)
            )
            doc = doc_result.scalar_one_or_none()
            assert doc is not None, f"{inst.form_name} document_id points to non-existent doc"

    @pytest.mark.asyncio
    async def test_form_instances_have_key_amount_fields(self, db: AsyncSession) -> None:
        """Each extracted form instance should have a key amount field with the correct value."""
        await demo_service.create_demo_user("key-amt-test")
        user = await demo_repo.get_user_by_email(db, "demo+key-amt-test@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None

        result = await db.execute(
            select(TaxReturn).where(TaxReturn.organization_id == org.id)
        )
        tax_return = result.scalar_one()

        instances_result = await db.execute(
            select(TaxFormInstance)
            .where(
                TaxFormInstance.tax_return_id == tax_return.id,
                TaxFormInstance.source_type == "extracted",
            )
            .options(selectinload(TaxFormInstance.fields))
        )
        instances = instances_result.scalars().all()

        expected_amounts = {
            "1099_k": ("gross_amount", Decimal("35500.00")),
            "1099_misc": ("box_1", Decimal("28800.00")),
            "1098": ("mortgage_interest_received", Decimal("12433.00")),
            "w2": ("wages_tips_other", Decimal("85000.00")),
        }

        for inst in instances:
            if inst.form_name not in expected_amounts:
                continue
            field_id, expected_amount = expected_amounts[inst.form_name]
            matching_fields = [f for f in inst.fields if f.field_id == field_id]
            assert len(matching_fields) == 1, f"{inst.form_name} missing field {field_id}"
            assert matching_fields[0].value_numeric == expected_amount, (
                f"{inst.form_name}.{field_id}: expected {expected_amount}, "
                f"got {matching_fields[0].value_numeric}"
            )

    @pytest.mark.asyncio
    async def test_form_instances_have_issuer_info(self, db: AsyncSession) -> None:
        """Extracted form instances should have issuer_name and issuer_ein set."""
        await demo_service.create_demo_user("issuer-test")
        user = await demo_repo.get_user_by_email(db, "demo+issuer-test@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None

        result = await db.execute(
            select(TaxReturn).where(TaxReturn.organization_id == org.id)
        )
        tax_return = result.scalar_one()

        instances_result = await db.execute(
            select(TaxFormInstance)
            .where(
                TaxFormInstance.tax_return_id == tax_return.id,
                TaxFormInstance.source_type == "extracted",
            )
        )
        instances = instances_result.scalars().all()

        expected_issuers = {
            "1099_k": "Airbnb, Inc.",
            "1099_misc": "Austin Property Management Co",
            "1098": "First National Bank",
            "w2": "Lone Star Technologies LLC",
        }

        for inst in instances:
            if inst.form_name in expected_issuers:
                assert inst.issuer_name == expected_issuers[inst.form_name], (
                    f"{inst.form_name} issuer_name: expected {expected_issuers[inst.form_name]}, "
                    f"got {inst.issuer_name}"
                )
                assert inst.issuer_ein is not None, f"{inst.form_name} missing issuer_ein"

    @pytest.mark.asyncio
    async def test_reset_preserves_tax_pipeline_wiring(self, db: AsyncSession) -> None:
        """After resetting a demo user, tax form instances should still exist."""
        created = await demo_service.create_demo_user("reset-pipe")
        user = await demo_repo.get_user_by_email(db, created.credentials.email)
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None

        await demo_service.reset_demo_user(user.id)

        result = await db.execute(
            select(TaxReturn).where(TaxReturn.organization_id == org.id)
        )
        tax_return = result.scalar_one()

        instances_result = await db.execute(
            select(TaxFormInstance)
            .where(
                TaxFormInstance.tax_return_id == tax_return.id,
                TaxFormInstance.source_type == "extracted",
            )
        )
        instances = instances_result.scalars().all()
        form_names = {inst.form_name for inst in instances}
        assert "1099_k" in form_names
        assert "1099_misc" in form_names
        assert "1098" in form_names
        assert "w2" in form_names


class TestAllDocumentsHavePdfContent:
    """All demo documents — both regular and tax — should have real PDF file content."""

    @pytest.mark.asyncio
    async def test_all_documents_have_file_content(self, db: AsyncSession) -> None:
        """Every seeded document should have non-empty file_content that starts with %PDF-."""
        await demo_service.create_demo_user("allpdf-test")
        user = await demo_repo.get_user_by_email(db, "demo+allpdf-test@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None

        result = await db.execute(
            select(Document.id, Document.file_name)
            .where(Document.organization_id == org.id)
        )
        docs = result.all()
        total_docs = len(DEMO_DOCUMENTS) + len(DEMO_TAX_DOCUMENTS)
        assert len(docs) == total_docs, f"Expected {total_docs} docs, got {len(docs)}"

        missing_content: list[str] = []
        invalid_pdf: list[str] = []
        for doc_id, file_name in docs:
            content_result = await db.execute(
                select(Document.file_content).where(Document.id == doc_id)
            )
            file_bytes = content_result.scalar_one()
            if file_bytes is None:
                missing_content.append(file_name)
            elif file_bytes[:5] != b"%PDF-":
                invalid_pdf.append(file_name)

        assert not missing_content, f"Documents missing file_content: {missing_content}"
        assert not invalid_pdf, f"Documents with invalid PDF content: {invalid_pdf}"

    @pytest.mark.asyncio
    async def test_irs_tax_docs_contain_form_data(self, db: AsyncSession) -> None:
        """IRS forms should contain the expected data values in extracted text."""
        await demo_service.create_demo_user("irs-data-test")
        user = await demo_repo.get_user_by_email(db, "demo+irs-data-test@mybookkeeper.com")
        assert user is not None
        org = await demo_repo.get_org_by_user(db, user.id)
        assert org is not None

        irs_docs = [
            d for d in DEMO_TAX_DOCUMENTS
            if d["pdf_data"]["form_type"] in ("1099-K", "1099-MISC", "1098", "W-2")
        ]
        for doc_data in irs_docs:
            fname = doc_data["file_name"]
            content_result = await db.execute(
                select(Document.file_content)
                .where(
                    Document.organization_id == org.id,
                    Document.file_name == fname,
                )
            )
            file_bytes = content_result.scalar_one()
            assert file_bytes is not None, f"{fname} has no content"
            assert file_bytes[:5] == b"%PDF-", f"{fname} is not a valid PDF"

            # Verify the PDF contains expected data by extracting text
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(file_bytes))
            text = reader.pages[0].extract_text()
            form_type = doc_data["pdf_data"]["form_type"]
            assert form_type.replace("-", "") in text.replace("-", "").replace(" ", ""), (
                f"{fname}: form type '{form_type}' not found in PDF text"
            )


class TestDemoPdfGenerators:
    """Direct unit tests for the PDF generator classes."""

    def test_tax_1099k_generates_valid_pdf_with_data(self) -> None:
        gen = DemoTaxPdfGenerator()
        pdf = gen.generate({
            "form_type": "1099-K",
            "issuer_name": "Airbnb, Inc.",
            "issuer_address": "888 Brannan St, San Francisco, CA 94103",
            "issuer_tin": "26-3544540",
            "recipient_name": "Test User",
            "recipient_address": "123 Main St, Anytown, USA 12345",
            "recipient_tin": "***-**-9999",
            "gross_amount": "10,000.00",
            "tax_year": "2025",
        })
        assert pdf[:5] == b"%PDF-"
        from pypdf import PdfReader
        text = PdfReader(io.BytesIO(pdf)).pages[0].extract_text()
        assert "Airbnb" in text
        assert "10,000" in text
        assert "1099" in text

    def test_tax_1099misc_generates_valid_pdf_with_data(self) -> None:
        gen = DemoTaxPdfGenerator()
        pdf = gen.generate({
            "form_type": "1099-MISC",
            "issuer_name": "PM Co",
            "issuer_address": "200 Congress Ave, Austin, TX 78701",
            "issuer_tin": "74-1111111",
            "recipient_name": "Test User",
            "recipient_address": "567 Oak St, Austin, TX 78701",
            "recipient_tin": "***-**-9999",
            "rents_amount": "28,800.00",
            "tax_year": "2025",
        })
        assert pdf[:5] == b"%PDF-"
        from pypdf import PdfReader
        text = PdfReader(io.BytesIO(pdf)).pages[0].extract_text()
        assert "PM Co" in text
        assert "28,800" in text
        assert "Rents" in text

    def test_tax_1098_generates_valid_pdf_with_data(self) -> None:
        gen = DemoTaxPdfGenerator()
        pdf = gen.generate({
            "form_type": "1098",
            "lender_name": "Test Bank",
            "lender_address": "500 Main St, LA, CA 90012",
            "lender_tin": "95-1234567",
            "borrower_name": "Test User",
            "borrower_address": "1234 Sunset Blvd, LA, CA 90028",
            "borrower_tin": "***-**-9999",
            "mortgage_interest": "12,000.00",
            "tax_year": "2025",
        })
        assert pdf[:5] == b"%PDF-"
        from pypdf import PdfReader
        text = PdfReader(io.BytesIO(pdf)).pages[0].extract_text()
        assert "Test Bank" in text
        assert "12,000" in text
        assert "Mortgage" in text

    def test_tax_w2_generates_valid_pdf_with_data(self) -> None:
        gen = DemoTaxPdfGenerator()
        pdf = gen.generate({
            "form_type": "W-2",
            "employer_name": "Lone Star Technologies LLC",
            "employer_address": "2200 W Parmer Ln, Suite 400, Austin, TX 78727",
            "employer_ein": "74-3219876",
            "employee_name": "Test User",
            "employee_address": "123 Main St, Anytown, USA 12345",
            "employee_ssn": "***-**-9999",
            "wages": "85,000.00",
            "federal_tax_withheld": "14,875.00",
            "ss_wages": "85,000.00",
            "ss_tax": "5,270.00",
            "medicare_wages": "85,000.00",
            "medicare_tax": "1,232.50",
            "state": "TX",
            "state_wages": "",
            "state_tax": "",
            "employer_state_id": "",
            "box_12a": "DD  4,200.00",
            "tax_year": "2025",
        })
        assert pdf[:5] == b"%PDF-"
        from pypdf import PdfReader
        text = PdfReader(io.BytesIO(pdf)).pages[0].extract_text()
        assert "Lone Star" in text
        assert "85,000" in text
        assert "14,875" in text
        assert "W-2" in text

    def test_property_tax_generates_valid_pdf(self) -> None:
        gen = DemoTaxPdfGenerator()
        pdf = gen.generate({
            "form_type": "Property Tax Statement",
            "authority_name": "Test County",
            "authority_address": "123 Gov Blvd, TX 78751",
            "property_address": "567 Oak St, Austin, TX 78701",
            "owner_name": "Test User",
            "tax_year": "2025",
            "assessed_value": "285,000.00",
            "tax_amount": "4,500.00",
        })
        assert pdf[:5] == b"%PDF-"

    def test_document_utility_bill_generates_valid_pdf(self) -> None:
        gen = DemoDocumentPdfGenerator()
        pdf = gen.generate(
            {"document_type": "utility_bill", "file_name": "test.pdf"},
            [{"vendor": "SoCal Edison", "amount": "95.00", "date": "2025-01-10",
              "description": "Electric bill", "property_address": "123 Main St",
              "property_name": "Test Prop", "sub_category": "electricity"}],
        )
        assert pdf[:5] == b"%PDF-"

    def test_document_payout_statement_generates_valid_pdf(self) -> None:
        gen = DemoDocumentPdfGenerator()
        pdf = gen.generate(
            {"document_type": "payout_statement", "file_name": "test.pdf"},
            [{"vendor": "Airbnb", "amount": "2800.00", "date": "2025-03-15",
              "description": "March payout", "property_address": "123 Main St",
              "property_name": "Sunset Villa", "sub_category": None}],
        )
        assert pdf[:5] == b"%PDF-"

    def test_document_invoice_generates_valid_pdf(self) -> None:
        gen = DemoDocumentPdfGenerator()
        pdf = gen.generate(
            {"document_type": "invoice", "file_name": "test.pdf"},
            [{"vendor": "Ace Plumbing", "amount": "850.00", "date": "2025-02-14",
              "description": "Sink repair", "property_address": "123 Main St",
              "property_name": "Test Prop", "sub_category": None}],
        )
        assert pdf[:5] == b"%PDF-"

    def test_document_receipt_generates_valid_pdf(self) -> None:
        gen = DemoDocumentPdfGenerator()
        pdf = gen.generate(
            {"document_type": "receipt", "file_name": "test.pdf"},
            [{"vendor": "Home Depot", "amount": "85.00", "date": "2025-04-02",
              "description": "Supplies", "property_address": "123 Main St",
              "property_name": "Test Prop", "sub_category": None}],
        )
        assert pdf[:5] == b"%PDF-"

    def test_document_rent_receipt_generates_valid_pdf(self) -> None:
        gen = DemoDocumentPdfGenerator()
        pdf = gen.generate(
            {"document_type": "rent_receipt", "file_name": "test.pdf"},
            [{"vendor": "Tenant - Sarah", "amount": "2400.00", "date": "2025-01-01",
              "description": "January rent", "property_address": "567 Oak St",
              "property_name": "Oak Street Duplex", "sub_category": None}],
        )
        assert pdf[:5] == b"%PDF-"

    def test_document_mortgage_statement_generates_valid_pdf(self) -> None:
        gen = DemoDocumentPdfGenerator()
        pdf = gen.generate(
            {"document_type": "mortgage_statement", "file_name": "test.pdf"},
            [{"vendor": "First National Bank", "amount": "1050.00", "date": "2025-01-01",
              "description": "Mortgage interest", "property_address": "123 Main St",
              "property_name": "Test Prop", "sub_category": None}],
        )
        assert pdf[:5] == b"%PDF-"

    def test_document_with_no_transactions_generates_fallback(self) -> None:
        gen = DemoDocumentPdfGenerator()
        pdf = gen.generate(
            {"document_type": "invoice", "file_name": "empty.pdf"},
            [],
        )
        assert pdf[:5] == b"%PDF-"

    def test_all_utility_vendors_have_brand_colors(self) -> None:
        """Every utility vendor in DEMO_TRANSACTIONS should produce a branded bill."""
        gen = DemoDocumentPdfGenerator()
        utility_vendors = set()
        for txn in DEMO_TRANSACTIONS:
            if txn[6] == "utilities":  # category index
                utility_vendors.add((txn[2], txn[9]))  # vendor, sub_category

        for vendor, sub_cat in utility_vendors:
            pdf = gen.generate(
                {"document_type": "utility_bill", "file_name": "test.pdf"},
                [{"vendor": vendor, "amount": "100.00", "date": "2025-01-10",
                  "description": "Test bill", "property_address": "123 Main St",
                  "property_name": "Test", "sub_category": sub_cat}],
            )
            assert pdf[:5] == b"%PDF-", f"Failed for vendor: {vendor}"
