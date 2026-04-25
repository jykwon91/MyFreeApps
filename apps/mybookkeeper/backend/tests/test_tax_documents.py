"""Tests for GET /tax-documents endpoint and list_all_source_documents service."""
import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.reservation import Reservation
from app.models.user.user import User
from app.services.tax import tax_return_service


@pytest_asyncio.fixture()
async def owner(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email='tax-docs-owner@example.com',
        hashed_password='fakehash',
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def org(db: AsyncSession, owner: User) -> Organization:
    from app.repositories import organization_repo
    o = await organization_repo.create(db, 'Tax Docs Test Org', owner.id)
    await db.commit()
    await db.refresh(o)
    return o


@pytest.fixture(autouse=True)
def _patch_sessions(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    with (
        patch('app.services.tax.tax_return_service.AsyncSessionLocal', _fake_session),
        patch('app.services.tax.tax_return_service.unit_of_work', _fake_session),
    ):
        yield


def _override_org_member(user: User, org: Organization):
    async def _dep():
        return RequestContext(
            organization_id=org.id,
            user_id=user.id,
            org_role='owner',
        )
    return _dep


@pytest_asyncio.fixture()
async def client(owner: User, org: Organization):
    from app.core.auth import current_active_user as cau

    app.dependency_overrides[cau] = lambda: None
    app.dependency_overrides[current_org_member] = _override_org_member(owner, org)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as c:
        yield c

    app.dependency_overrides.clear()


def _make_ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(
        organization_id=org.id,
        user_id=user.id,
        org_role='owner',
    )


class TestListTaxDocumentsRoute:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_tax_returns_exist(
        self, client: AsyncClient,
    ) -> None:
        resp = await client.get('/tax-documents')
        assert resp.status_code == 200
        data = resp.json()
        assert data['documents'] == []
        assert data['checklist'] == []

    @pytest.mark.asyncio
    async def test_returns_empty_when_tax_year_filter_matches_nothing(
        self, client: AsyncClient, db: AsyncSession, org: Organization,
    ) -> None:
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.commit()

        resp = await client.get('/tax-documents', params={'tax_year': 2024})
        assert resp.status_code == 200
        data = resp.json()
        assert data['documents'] == []
        assert data['checklist'] == []

    @pytest.mark.asyncio
    async def test_returns_documents_across_all_years_when_no_filter(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        owner: User,
    ) -> None:
        tr_2024 = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2024)
        tr_2025 = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add_all([tr_2024, tr_2025])
        await db.flush()

        for tr, fname in [(tr_2024, 'w2-2024.pdf'), (tr_2025, 'w2-2025.pdf')]:
            doc = Document(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=owner.id,
                file_name=fname,
                source='upload',
                status='completed',
            )
            db.add(doc)
            await db.flush()
            inst = TaxFormInstance(
                id=uuid.uuid4(),
                tax_return_id=tr.id,
                form_name='w2',
                source_type='extracted',
                document_id=doc.id,
                issuer_name='Employer Inc',
            )
            db.add(inst)

        await db.commit()

        resp = await client.get('/tax-documents')
        assert resp.status_code == 200
        data = resp.json()
        file_names = {d['file_name'] for d in data['documents']}
        assert 'w2-2024.pdf' in file_names
        assert 'w2-2025.pdf' in file_names

    @pytest.mark.asyncio
    async def test_filters_documents_by_tax_year(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        owner: User,
    ) -> None:
        tr_2024 = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2024)
        tr_2025 = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add_all([tr_2024, tr_2025])
        await db.flush()

        for tr, fname in [(tr_2024, 'w2-2024.pdf'), (tr_2025, 'w2-2025.pdf')]:
            doc = Document(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=owner.id,
                file_name=fname,
                source='upload',
                status='completed',
            )
            db.add(doc)
            await db.flush()
            inst = TaxFormInstance(
                id=uuid.uuid4(),
                tax_return_id=tr.id,
                form_name='w2',
                source_type='extracted',
                document_id=doc.id,
                issuer_name='Employer Inc',
            )
            db.add(inst)

        await db.commit()

        resp = await client.get('/tax-documents', params={'tax_year': 2025})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data['documents']) == 1
        assert data['documents'][0]['file_name'] == 'w2-2025.pdf'
        assert data['documents'][0]['tax_year'] == 2025

    @pytest.mark.asyncio
    async def test_response_has_documents_and_checklist_keys(
        self, client: AsyncClient,
    ) -> None:
        resp = await client.get('/tax-documents')
        assert resp.status_code == 200
        data = resp.json()
        assert 'documents' in data
        assert 'checklist' in data
        assert isinstance(data['documents'], list)
        assert isinstance(data['checklist'], list)


class TestListAllSourceDocumentsService:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_tax_returns_exist(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        result = await tax_return_service.list_all_source_documents(ctx)
        assert result.documents == []
        assert result.checklist == []

    @pytest.mark.asyncio
    async def test_returns_empty_when_tax_year_filter_matches_nothing(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.commit()

        result = await tax_return_service.list_all_source_documents(ctx, tax_year=2024)
        assert result.documents == []
        assert result.checklist == []

    @pytest.mark.asyncio
    async def test_aggregates_documents_across_multiple_returns(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        tr_2024 = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2024)
        tr_2025 = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add_all([tr_2024, tr_2025])
        await db.flush()

        for tr, fname in [(tr_2024, '1099-MISC-2024.pdf'), (tr_2025, '1099-MISC-2025.pdf')]:
            doc = Document(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=owner.id,
                file_name=fname,
                source='upload',
                status='completed',
            )
            db.add(doc)
            await db.flush()
            inst = TaxFormInstance(
                id=uuid.uuid4(),
                tax_return_id=tr.id,
                form_name='1099_misc',
                source_type='extracted',
                document_id=doc.id,
                issuer_name='Vendor Inc',
            )
            db.add(inst)

        await db.commit()

        result = await tax_return_service.list_all_source_documents(ctx)
        assert len(result.documents) == 2
        file_names = {d.file_name for d in result.documents}
        assert '1099-MISC-2024.pdf' in file_names
        assert '1099-MISC-2025.pdf' in file_names

    @pytest.mark.asyncio
    async def test_deduplicates_documents_by_form_instance_id(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()
        doc = Document(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            file_name='w2.pdf',
            source='upload',
            status='completed',
        )
        db.add(doc)
        await db.flush()
        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name='w2',
            source_type='extracted',
            document_id=doc.id,
            issuer_name='Employer Inc',
        )
        db.add(inst)
        await db.commit()

        result = await tax_return_service.list_all_source_documents(ctx)
        assert len(result.documents) == 1

    @pytest.mark.asyncio
    async def test_deduplicates_checklist_by_type_and_issuer(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        tr_2024 = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2024)
        tr_2025 = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add_all([tr_2024, tr_2025])
        await db.flush()
        for year in [2024, 2025]:
            res = Reservation(
                id=uuid.uuid4(),
                organization_id=org.id,
                res_code=f'RES-{year}',
                platform='airbnb',
                check_in=date(year, 6, 1),
                check_out=date(year, 6, 5),
                gross_booking=Decimal('500.00'),
            )
            db.add(res)
        await db.commit()

        result = await tax_return_service.list_all_source_documents(ctx)
        airbnb_items = [
            c for c in result.checklist
            if c.expected_type == '1099_k' and c.expected_from == 'Airbnb'
        ]
        assert len(airbnb_items) == 1

    @pytest.mark.asyncio
    async def test_excludes_computed_form_types_from_documents(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()
        doc = Document(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            file_name='schedule-e.pdf',
            source='upload',
            status='completed',
        )
        db.add(doc)
        await db.flush()
        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name='schedule_e',
            source_type='computed',
            document_id=doc.id,
        )
        db.add(inst)
        await db.commit()

        result = await tax_return_service.list_all_source_documents(ctx)
        assert result.documents == []


class TestGetSourceDocumentsForReturn:
    @pytest.mark.asyncio
    async def test_builds_source_document_with_key_amount(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()
        doc = Document(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            file_name='1099-NEC-Acme.pdf',
            source='upload',
            status='completed',
        )
        db.add(doc)
        await db.flush()
        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name='1099_nec',
            source_type='extracted',
            document_id=doc.id,
            issuer_name='Acme Corp',
            issuer_ein='12-3456789',
        )
        db.add(inst)
        await db.flush()
        field = TaxFormField(
            id=uuid.uuid4(),
            form_instance_id=inst.id,
            field_id='nonemployee_compensation',
            field_label='Nonemployee Compensation',
            value_numeric=Decimal('12500.00'),
        )
        db.add(field)
        await db.commit()

        result = await tax_return_service.get_source_documents(ctx, tr.id)

        assert len(result.documents) == 1
        doc_result = result.documents[0]
        assert doc_result.document_id == doc.id
        assert doc_result.file_name == '1099-NEC-Acme.pdf'
        assert doc_result.document_type == '1099_nec'
        assert doc_result.issuer_name == 'Acme Corp'
        assert doc_result.issuer_ein == '***6789'  # EIN is masked via mask_pii
        assert doc_result.tax_year == 2025
        assert doc_result.key_amount == 12500.00
        assert doc_result.form_instance_id == inst.id

    @pytest.mark.asyncio
    async def test_key_amount_is_none_when_key_field_absent(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()
        doc = Document(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            file_name='1098-incomplete.pdf',
            source='upload',
            status='completed',
        )
        db.add(doc)
        await db.flush()
        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name='1098',
            source_type='extracted',
            document_id=doc.id,
            issuer_name='Wells Fargo',
        )
        db.add(inst)
        await db.flush()
        field = TaxFormField(
            id=uuid.uuid4(),
            form_instance_id=inst.id,
            field_id='lender_name',
            field_label='Lender Name',
            value_text='Wells Fargo Bank',
        )
        db.add(field)
        await db.commit()

        result = await tax_return_service.get_source_documents(ctx, tr.id)

        assert len(result.documents) == 1
        assert result.documents[0].key_amount is None

    @pytest.mark.asyncio
    async def test_skips_instance_with_no_document_id(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        ctx = _make_ctx(org, owner)
        tr = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
        db.add(tr)
        await db.flush()
        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name='w2',
            source_type='manual',
            document_id=None,
            issuer_name='Employer Inc',
        )
        db.add(inst)
        await db.commit()

        result = await tax_return_service.get_source_documents(ctx, tr.id)
        assert result.documents == []
