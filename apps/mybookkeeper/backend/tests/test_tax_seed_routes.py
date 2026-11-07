"""Tests for the test-only tax seed routes."""
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from pydantic import ValidationError
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import RequestContext
from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.reconciliation_source import ReconciliationSource
from app.models.user.user import User
from app.test_helpers.tax_seed import (
    _SeedFormInstanceRequest,
    _SeedTaxSourceDocumentRequest,
    delete_reconciliation_source,
    seed_form_instance,
    seed_tax_source_document,
)


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with patch("app.test_helpers.tax_seed.unit_of_work", _fake_uow):
        yield


@pytest.fixture()
def test_mode():
    original = settings.allow_test_admin_promotion
    settings.allow_test_admin_promotion = True
    yield
    settings.allow_test_admin_promotion = original


def _ctx(org_id: uuid.UUID, user: User) -> RequestContext:
    return RequestContext(user_id=user.id, organization_id=org_id, org_role=OrgRole.OWNER)


async def _make_return(db: AsyncSession, org_id: uuid.UUID) -> TaxReturn:
    tax_return = TaxReturn(id=uuid.uuid4(), organization_id=org_id, tax_year=2031)
    db.add(tax_return)
    await db.commit()
    return tax_return


class TestSeedFormInstance:
    @pytest.mark.asyncio
    async def test_adds_a_manual_instance_to_my_return(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        tax_return = await _make_return(db, test_org.id)

        seeded = await seed_form_instance(
            tax_return.id,
            _SeedFormInstanceRequest(form_name="w2", instance_label="Acme Corp"),
            ctx=_ctx(test_org.id, test_user),
        )

        instance = (await db.execute(select(TaxFormInstance).where(TaxFormInstance.id == seeded.id))).scalar_one()
        assert instance.tax_return_id == tax_return.id
        assert instance.form_name == "w2"
        assert instance.source_type == "manual"
        assert instance.instance_label == "Acme Corp"

    @pytest.mark.asyncio
    async def test_another_organizations_return_is_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        tax_return = await _make_return(db, test_org.id)

        with pytest.raises(HTTPException) as exc_info:
            await seed_form_instance(
                tax_return.id,
                _SeedFormInstanceRequest(form_name="w2"),
                ctx=_ctx(uuid.uuid4(), test_user),
            )
        assert exc_info.value.status_code == 404
        assert (await db.execute(select(TaxFormInstance))).first() is None

    @pytest.mark.asyncio
    async def test_not_found_outside_test_mode(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tax_return = await _make_return(db, test_org.id)
        original = settings.allow_test_admin_promotion
        settings.allow_test_admin_promotion = False
        try:
            with pytest.raises(HTTPException) as exc_info:
                await seed_form_instance(
                    tax_return.id,
                    _SeedFormInstanceRequest(form_name="w2"),
                    ctx=_ctx(test_org.id, test_user),
                )
        finally:
            settings.allow_test_admin_promotion = original
        assert exc_info.value.status_code == 404
        assert (await db.execute(select(TaxFormInstance))).first() is None


async def _make_source(db: AsyncSession, org_id: uuid.UUID, user: User) -> ReconciliationSource:
    source = ReconciliationSource(
        organization_id=org_id, user_id=user.id, source_type="1099_k",
        tax_year=2031, issuer="E2E Issuer", reported_amount=Decimal("100.00"),
    )
    db.add(source)
    await db.commit()
    return source


async def _source_ids(db: AsyncSession) -> list[uuid.UUID]:
    return list((await db.execute(select(ReconciliationSource.id))).scalars().all())


class TestDeleteReconciliationSource:
    @pytest.mark.asyncio
    async def test_deletes_my_source(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        source = await _make_source(db, test_org.id, test_user)
        other = await _make_source(db, test_org.id, test_user)

        await delete_reconciliation_source(source.id, ctx=_ctx(test_org.id, test_user))

        assert await _source_ids(db) == [other.id]

    @pytest.mark.asyncio
    async def test_another_organizations_source_is_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        source = await _make_source(db, test_org.id, test_user)

        with pytest.raises(HTTPException) as exc_info:
            await delete_reconciliation_source(source.id, ctx=_ctx(uuid.uuid4(), test_user))
        assert exc_info.value.status_code == 404
        assert await _source_ids(db) == [source.id]

    @pytest.mark.asyncio
    async def test_not_found_outside_test_mode(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        source = await _make_source(db, test_org.id, test_user)
        original = settings.allow_test_admin_promotion
        settings.allow_test_admin_promotion = False
        try:
            with pytest.raises(HTTPException) as exc_info:
                await delete_reconciliation_source(source.id, ctx=_ctx(test_org.id, test_user))
        finally:
            settings.allow_test_admin_promotion = original
        assert exc_info.value.status_code == 404
        assert await _source_ids(db) == [source.id]


async def _make_document(db: AsyncSession, org_id: uuid.UUID, user: User) -> Document:
    document = Document(
        organization_id=org_id, user_id=user.id, file_name="w2.pdf",
        document_type="w2", source="upload", status="completed",
    )
    db.add(document)
    await db.commit()
    return document


def _w2(document_id: uuid.UUID) -> _SeedTaxSourceDocumentRequest:
    return _SeedTaxSourceDocumentRequest(
        document_id=document_id, document_type="w2", tax_year=2031,
        issuer_name="Acme Staffing LLC", fields={"wages_tips_compensation": Decimal("52000.00")},
    )


class TestSeedTaxSourceDocument:
    @pytest.mark.asyncio
    async def test_files_my_document_under_the_years_return(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        document = await _make_document(db, test_org.id, test_user)

        seeded = await seed_tax_source_document(_w2(document.id), ctx=_ctx(test_org.id, test_user))

        instance = (await db.execute(select(TaxFormInstance).where(TaxFormInstance.id == seeded.form_instance_id))).scalar_one()
        tax_return = (await db.execute(select(TaxReturn).where(TaxReturn.id == seeded.tax_return_id))).scalar_one()
        assert tax_return.organization_id == test_org.id
        assert tax_return.tax_year == 2031
        assert instance.document_id == document.id
        assert instance.form_name == "w2"
        assert instance.source_type == "extracted"
        assert instance.issuer_name == "Acme Staffing LLC"
        wages = (await db.execute(select(TaxFormField).where(TaxFormField.form_instance_id == instance.id))).scalar_one()
        assert wages.field_id == "wages_tips_compensation"
        assert wages.value_numeric == Decimal("52000.00")

    @pytest.mark.asyncio
    async def test_another_organizations_document_is_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        document = await _make_document(db, test_org.id, test_user)

        with pytest.raises(HTTPException) as exc_info:
            await seed_tax_source_document(_w2(document.id), ctx=_ctx(uuid.uuid4(), test_user))
        assert exc_info.value.status_code == 404
        assert (await db.execute(select(TaxFormInstance))).first() is None

    @pytest.mark.asyncio
    async def test_not_found_outside_test_mode(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        document = await _make_document(db, test_org.id, test_user)
        original = settings.allow_test_admin_promotion
        settings.allow_test_admin_promotion = False
        try:
            with pytest.raises(HTTPException) as exc_info:
                await seed_tax_source_document(_w2(document.id), ctx=_ctx(test_org.id, test_user))
        finally:
            settings.allow_test_admin_promotion = original
        assert exc_info.value.status_code == 404
        assert (await db.execute(select(TaxFormInstance))).first() is None

    def test_rejects_a_document_type_that_is_not_a_tax_source(self) -> None:
        with pytest.raises(ValidationError):
            _SeedTaxSourceDocumentRequest(
                document_id=uuid.uuid4(), document_type="invoice", tax_year=2031, issuer_name="Acme",
            )
