import uuid
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories import tax_form_repo, tax_return_repo
from app.services.tax.tax_extraction_service import (
    is_tax_source_document,
    process_tax_document,
)


class TestIsTaxSourceDocument:
    def test_recognizes_tax_forms(self) -> None:
        for form_type in ["w2", "1099_int", "1099_div", "1099_b", "1099_k",
                          "1099_misc", "1099_nec", "1099_r", "1098", "k1"]:
            assert is_tax_source_document(form_type) is True

    def test_rejects_non_tax_types(self) -> None:
        for doc_type in ["invoice", "statement", "lease", "tax_form", "other", "1040"]:
            assert is_tax_source_document(doc_type) is False


class TestProcessTaxDocument:
    @pytest.mark.asyncio
    async def test_creates_return_instance_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        doc_id = uuid.uuid4()
        ext_id = uuid.uuid4()

        instance = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=doc_id,
            extraction_id=ext_id,
            document_type="w2",
            tax_form_data={
                "issuer_ein": "12-3456789",
                "issuer_name": "Acme Corp",
                "tax_year": 2025,
                "fields": {
                    "box_1": 75000.00,
                    "box_2": 12500.00,
                },
            },
        )

        assert instance.form_name == "w2"
        assert instance.source_type == "extracted"
        assert instance.issuer_ein == "12-3456789"
        assert instance.issuer_name == "Acme Corp"
        assert instance.document_id == doc_id
        assert instance.extraction_id == ext_id

        returns = await tax_return_repo.list_by_org(db, test_org.id)
        assert len(returns) == 1
        assert returns[0].tax_year == 2025
        assert returns[0].needs_recompute is True

        fields = await tax_form_repo.get_fields(db, instance.id)
        assert len(fields) == 2
        field_map = {f.field_id: f for f in fields}
        assert field_map["box_1"].value_numeric == Decimal("75000")
        assert field_map["box_2"].value_numeric == Decimal("12500")
        assert field_map["box_1"].field_label == "Wages, tips, other compensation"
        assert field_map["box_2"].field_label == "Federal income tax withheld"

    @pytest.mark.asyncio
    async def test_reuses_existing_tax_return(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        existing = await tax_return_repo.get_or_create_for_year(
            db, test_org.id, 2025,
        )
        await db.commit()

        await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=uuid.uuid4(),
            extraction_id=uuid.uuid4(),
            document_type="1099_int",
            tax_form_data={
                "issuer_ein": "98-7654321",
                "issuer_name": "Big Bank",
                "tax_year": 2025,
                "fields": {"box_1": 500.00},
            },
        )

        returns = await tax_return_repo.list_by_org(db, test_org.id)
        assert len(returns) == 1
        assert returns[0].id == existing.id

    @pytest.mark.asyncio
    async def test_creates_field_sources(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        instance = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=uuid.uuid4(),
            extraction_id=uuid.uuid4(),
            document_type="1098",
            tax_form_data={
                "issuer_name": "Chase Mortgage",
                "tax_year": 2025,
                "fields": {"box_1": 15000.00},
            },
        )

        fields = await tax_form_repo.get_fields(db, instance.id)
        assert len(fields) == 1
        field = fields[0]
        assert field.field_label == "Mortgage interest received from payer(s)/borrower(s)"
        assert field.confidence == "high"

    @pytest.mark.asyncio
    async def test_handles_text_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        instance = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=uuid.uuid4(),
            extraction_id=uuid.uuid4(),
            document_type="w2",
            tax_form_data={
                "issuer_name": "Acme Corp",
                "tax_year": 2025,
                "fields": {
                    "box_1": 75000.00,
                    "box_15_state": "TX",
                },
            },
        )

        fields = await tax_form_repo.get_fields(db, instance.id)
        field_map = {f.field_id: f for f in fields}
        assert field_map["box_15_state"].value_text == "TX"
        assert field_map["box_15_state"].value_numeric is None

    @pytest.mark.asyncio
    async def test_skips_none_values(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        instance = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=uuid.uuid4(),
            extraction_id=uuid.uuid4(),
            document_type="w2",
            tax_form_data={
                "issuer_name": "Acme Corp",
                "tax_year": 2025,
                "fields": {
                    "box_1": 75000.00,
                    "box_7": None,
                },
            },
        )

        fields = await tax_form_repo.get_fields(db, instance.id)
        field_ids = [f.field_id for f in fields]
        assert "box_1" in field_ids
        assert "box_7" not in field_ids

    @pytest.mark.asyncio
    async def test_raises_on_missing_tax_year(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        with pytest.raises(ValueError, match="tax_year"):
            await process_tax_document(
                db,
                organization_id=test_org.id,
                document_id=uuid.uuid4(),
                extraction_id=uuid.uuid4(),
                document_type="w2",
                tax_form_data={
                    "issuer_name": "Acme Corp",
                    "fields": {"box_1": 75000.00},
                },
            )

    @pytest.mark.asyncio
    async def test_dedup_same_document_returns_existing_instance(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Re-extracting the same document should update, not create a duplicate."""
        doc_id = uuid.uuid4()
        form_data = {
            "issuer_ein": "87-1674733",
            "issuer_name": "Vello LLC",
            "tax_year": 2025,
            "fields": {"box_1": 45724.88},
        }

        first = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=doc_id,
            extraction_id=uuid.uuid4(),
            document_type="1099_misc",
            tax_form_data=form_data,
        )

        second = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=doc_id,
            extraction_id=uuid.uuid4(),
            document_type="1099_misc",
            tax_form_data=form_data,
        )

        assert second.id == first.id

        tax_return = (await tax_return_repo.list_by_org(db, test_org.id))[0]
        instances = await tax_form_repo.list_instances(db, tax_return.id)
        misc_instances = [i for i in instances if i.form_name == "1099_misc"]
        assert len(misc_instances) == 1

    @pytest.mark.asyncio
    async def test_same_ein_different_documents_creates_separate_instances(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Two documents with the same EIN (e.g., two 1098s from same lender) create separate instances."""
        form_data = {
            "issuer_ein": "74-1260543",
            "issuer_name": "Texas Dow Credit Union",
            "tax_year": 2025,
            "fields": {"box_1": 12500.00},
        }

        first = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=uuid.uuid4(),
            extraction_id=uuid.uuid4(),
            document_type="1098",
            tax_form_data=form_data,
        )

        second = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=uuid.uuid4(),
            extraction_id=uuid.uuid4(),
            document_type="1098",
            tax_form_data=form_data,
        )

        assert second.id != first.id

        tax_return = (await tax_return_repo.list_by_org(db, test_org.id))[0]
        instances = await tax_form_repo.list_instances(db, tax_return.id)
        mortgage_instances = [i for i in instances if i.form_name == "1098"]
        assert len(mortgage_instances) == 2

    @pytest.mark.asyncio
    async def test_dedup_same_document_returns_existing_instance(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Re-extracting the same document should not create a duplicate instance."""
        doc_id = uuid.uuid4()

        first = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=doc_id,
            extraction_id=uuid.uuid4(),
            document_type="w2",
            tax_form_data={
                "issuer_name": "Acme Corp",
                "tax_year": 2025,
                "fields": {"box_1": 75000.00},
            },
        )

        second = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=doc_id,
            extraction_id=uuid.uuid4(),
            document_type="w2",
            tax_form_data={
                "issuer_name": "Acme Corp",
                "tax_year": 2025,
                "fields": {"box_1": 80000.00},
            },
        )

        assert second.id == first.id

    @pytest.mark.asyncio
    async def test_different_ein_creates_separate_instances(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Different EINs for the same form type should create separate instances."""
        first = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=uuid.uuid4(),
            extraction_id=uuid.uuid4(),
            document_type="1099_misc",
            tax_form_data={
                "issuer_ein": "11-1111111",
                "issuer_name": "Company A",
                "tax_year": 2025,
                "fields": {"box_1": 1000.00},
            },
        )

        second = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=uuid.uuid4(),
            extraction_id=uuid.uuid4(),
            document_type="1099_misc",
            tax_form_data={
                "issuer_ein": "22-2222222",
                "issuer_name": "Company B",
                "tax_year": 2025,
                "fields": {"box_1": 2000.00},
            },
        )

        assert second.id != first.id

    @pytest.mark.asyncio
    async def test_no_ein_no_doc_id_creates_new_instance(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Without EIN or document_id, dedup can't match — creates new instance each time."""
        first = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=None,
            extraction_id=None,
            document_type="w2",
            tax_form_data={
                "issuer_name": "Unknown Employer",
                "tax_year": 2025,
                "fields": {"box_1": 50000.00},
            },
        )

        second = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=None,
            extraction_id=None,
            document_type="w2",
            tax_form_data={
                "issuer_name": "Unknown Employer",
                "tax_year": 2025,
                "fields": {"box_1": 50000.00},
            },
        )

        assert second.id != first.id

    @pytest.mark.asyncio
    async def test_delete_instance_removes_fields_via_cascade(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Deleting an instance should cascade-delete its fields."""
        instance = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=uuid.uuid4(),
            extraction_id=uuid.uuid4(),
            document_type="w2",
            tax_form_data={
                "issuer_name": "Delete Me Corp",
                "tax_year": 2025,
                "fields": {"box_1": 10000.00, "box_2": 2000.00},
            },
        )

        fields_before = await tax_form_repo.get_fields(db, instance.id)
        assert len(fields_before) == 2

        await tax_form_repo.delete_instance(db, instance)

        remaining = await tax_form_repo.get_instance(db, instance.id)
        assert remaining is None

    @pytest.mark.asyncio
    async def test_unknown_field_uses_field_id_as_label(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        instance = await process_tax_document(
            db,
            organization_id=test_org.id,
            document_id=uuid.uuid4(),
            extraction_id=uuid.uuid4(),
            document_type="w2",
            tax_form_data={
                "issuer_name": "Acme Corp",
                "tax_year": 2025,
                "fields": {"custom_field": 100.00},
            },
        )

        fields = await tax_form_repo.get_fields(db, instance.id)
        assert len(fields) == 1
        assert fields[0].field_id == "custom_field"
        assert fields[0].field_label == "custom_field"
