"""Tests for GET /tax-documents endpoint and list_all_source_documents service."""
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.booking_statement import BookingStatement
from app.models.transactions.transaction import Transaction
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
            bs = BookingStatement(
                id=uuid.uuid4(),
                organization_id=org.id,
                res_code=f'RES-{year}',
                platform='airbnb',
                check_in=date(year, 6, 1),
                check_out=date(year, 6, 5),
                gross_booking=Decimal('500.00'),
            )
            db.add(bs)
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


class TestChecklist:
    """What "still waiting on" has to get right. A hidden missing form is the costly mistake."""

    async def _booking(
        self, db: AsyncSession, org: Organization, platform: str, property_id: uuid.UUID | None = None,
    ) -> None:
        db.add(BookingStatement(
            id=uuid.uuid4(),
            organization_id=org.id,
            property_id=property_id,
            res_code=f'RES-{uuid.uuid4().hex[:8]}',
            platform=platform,
            check_in=date(2025, 6, 1),
            check_out=date(2025, 6, 5),
            gross_booking=Decimal('500.00'),
        ))
        await db.commit()

    async def _form(
        self, db: AsyncSession, org: Organization, owner: User, form: str, issuer: str | None, *, deleted: bool = False,
    ) -> Document:
        result = await db.execute(
            select(TaxReturn).where(TaxReturn.organization_id == org.id, TaxReturn.tax_year == 2025)
        )
        tax_return = result.scalar_one_or_none()
        if tax_return is None:
            tax_return = TaxReturn(id=uuid.uuid4(), organization_id=org.id, tax_year=2025)
            db.add(tax_return)
            await db.flush()
        doc = Document(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            file_name=f'{form}.pdf',
            source='upload',
            status='completed',
            deleted_at=datetime.now(timezone.utc) if deleted else None,
        )
        db.add(doc)
        await db.flush()
        db.add(TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tax_return.id,
            form_name=form,
            source_type='extracted',
            document_id=doc.id,
            issuer_name=issuer,
        ))
        await db.commit()
        return doc

    async def _property(self, db: AsyncSession, org: Organization, owner: User, name: str) -> Property:
        prop = Property(id=uuid.uuid4(), organization_id=org.id, user_id=owner.id, name=name, address=f'{name} address')
        db.add(prop)
        await db.commit()
        return prop

    async def _transaction(
        self,
        db: AsyncSession,
        org: Organization,
        owner: User,
        category: str,
        property_id: uuid.UUID | None,
        *,
        status: str = 'approved',
    ) -> None:
        db.add(Transaction(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            property_id=property_id,
            transaction_date=date(2025, 3, 1),
            tax_year=2025,
            vendor='Acme Management',
            amount=Decimal('100.00'),
            transaction_type='expense',
            category=category,
            status=status,
        ))
        await db.commit()

    async def _checklist(self, org: Organization, owner: User) -> list[tuple[str, str | None, str]]:
        result = await tax_return_service.list_all_source_documents(_make_ctx(org, owner), tax_year=2025)
        return [(item.expected_type, item.expected_from, item.status) for item in result.checklist]

    @pytest.mark.asyncio
    async def test_another_issuers_form_does_not_count(self, db: AsyncSession, owner: User, org: Organization) -> None:
        await self._booking(db, org, 'airbnb')
        await self._booking(db, org, 'vrbo')
        await self._form(db, org, owner, '1099_k', 'Airbnb Payments')
        assert sorted(await self._checklist(org, owner)) == [
            ('1099_k', 'Airbnb', 'received'),
            ('1099_k', 'Vrbo', 'missing'),
        ]

    @pytest.mark.asyncio
    async def test_vrbo_form_issued_by_its_parent_counts(self, db: AsyncSession, owner: User, org: Organization) -> None:
        await self._booking(db, org, 'vrbo')
        await self._form(db, org, owner, '1099_k', 'HomeAway.com, Inc.')
        assert await self._checklist(org, owner) == [('1099_k', 'Vrbo', 'received')]

    @pytest.mark.asyncio
    async def test_form_with_unread_issuer_counts(self, db: AsyncSession, owner: User, org: Organization) -> None:
        await self._booking(db, org, 'airbnb')
        await self._form(db, org, owner, '1099_k', None)
        assert await self._checklist(org, owner) == [('1099_k', 'Airbnb', 'received')]

    @pytest.mark.asyncio
    async def test_one_unread_form_answers_for_one_row(self, db: AsyncSession, owner: User, org: Organization) -> None:
        await self._booking(db, org, 'airbnb')
        await self._booking(db, org, 'vrbo')
        await self._form(db, org, owner, '1099_k', None)
        statuses = sorted(item[2] for item in await self._checklist(org, owner))
        assert statuses == ['missing', 'received']

    @pytest.mark.asyncio
    @pytest.mark.parametrize('issuer', ['Acme Management, LLC', 'Acme Management Group'])
    async def test_a_managers_name_can_differ_a_little(
        self, db: AsyncSession, owner: User, org: Organization, issuer: str,
    ) -> None:
        await self._transaction(db, org, owner, 'management_fee', None)
        await self._form(db, org, owner, '1099_misc', issuer)
        assert await self._checklist(org, owner) == [('1099_misc', 'Acme Management', 'received')]

    @pytest.mark.asyncio
    async def test_direct_bookings_expect_no_1099k(self, db: AsyncSession, owner: User, org: Organization) -> None:
        await self._booking(db, org, 'direct')
        assert await self._checklist(org, owner) == []

    @pytest.mark.asyncio
    async def test_booking_com_keeps_its_name(self, db: AsyncSession, owner: User, org: Organization) -> None:
        await self._booking(db, org, 'booking.com')
        assert await self._checklist(org, owner) == [('1099_k', 'Booking.com', 'missing')]

    @pytest.mark.asyncio
    async def test_year_with_no_return_still_says_whats_expected(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        await self._booking(db, org, 'airbnb')
        assert await self._checklist(org, owner) == [('1099_k', 'Airbnb', 'missing')]
        result = await db.execute(select(TaxReturn).where(TaxReturn.organization_id == org.id))
        assert result.scalars().all() == []

    @pytest.mark.asyncio
    async def test_no_year_and_no_return_stays_empty(self, db: AsyncSession, owner: User, org: Organization) -> None:
        await self._booking(db, org, 'airbnb')
        result = await tax_return_service.list_all_source_documents(_make_ctx(org, owner))
        assert result.checklist == []

    @pytest.mark.asyncio
    async def test_deleted_document_is_not_listed_or_counted(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        await self._booking(db, org, 'airbnb')
        await self._form(db, org, owner, '1099_k', 'Airbnb', deleted=True)
        result = await tax_return_service.list_all_source_documents(_make_ctx(org, owner), tax_year=2025)
        assert result.documents == []
        assert result.checklist[0].status == 'missing'

    @pytest.mark.asyncio
    async def test_one_1098_does_not_clear_two_properties(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        elm = await self._property(db, org, owner, 'Elm St')
        oak = await self._property(db, org, owner, 'Oak St')
        await self._transaction(db, org, owner, 'mortgage_interest', elm.id)
        await self._transaction(db, org, owner, 'mortgage_interest', oak.id)
        await self._form(db, org, owner, '1098', 'Wells Fargo')
        result = await tax_return_service.list_all_source_documents(_make_ctx(org, owner), tax_year=2025)
        assert len(result.checklist) == 1
        assert result.checklist[0].status == 'missing'
        assert result.checklist[0].reason == 'Mortgage interest transactions exist for Elm St and Oak St. I have 1 of 2 1098s'

    @pytest.mark.asyncio
    async def test_enough_1098s_clear_the_row(self, db: AsyncSession, owner: User, org: Organization) -> None:
        elm = await self._property(db, org, owner, 'Elm St')
        oak = await self._property(db, org, owner, 'Oak St')
        await self._transaction(db, org, owner, 'mortgage_interest', elm.id)
        await self._transaction(db, org, owner, 'mortgage_interest', oak.id)
        await self._form(db, org, owner, '1098', 'Wells Fargo')
        await self._form(db, org, owner, '1098', 'Chase')
        assert await self._checklist(org, owner) == [('1098', None, 'received')]

    @pytest.mark.asyncio
    async def test_managed_property_does_not_hide_a_self_run_ones_1099k(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        managed = await self._property(db, org, owner, 'Elm St')
        self_run = await self._property(db, org, owner, 'Oak St')
        await self._transaction(db, org, owner, 'management_fee', managed.id)
        await self._booking(db, org, 'vrbo', managed.id)
        await self._booking(db, org, 'airbnb', self_run.id)
        items = await self._checklist(org, owner)
        assert ('1099_k', 'Airbnb', 'missing') in items
        assert ('1099_k', 'Vrbo', 'missing') not in items

    @pytest.mark.asyncio
    async def test_fees_naming_no_property_cover_everything(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        await self._transaction(db, org, owner, 'management_fee', None)
        await self._booking(db, org, 'airbnb')
        assert [item for item in await self._checklist(org, owner) if item[0] == '1099_k'] == []

    @pytest.mark.asyncio
    async def test_unapproved_fee_does_not_hide_a_1099k(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        managed = await self._property(db, org, owner, 'Elm St')
        self_run = await self._property(db, org, owner, 'Oak St')
        await self._transaction(db, org, owner, 'management_fee', managed.id)
        await self._transaction(db, org, owner, 'management_fee', self_run.id, status='duplicate')
        await self._booking(db, org, 'airbnb', self_run.id)
        assert ('1099_k', 'Airbnb', 'missing') in await self._checklist(org, owner)

    @pytest.mark.asyncio
    async def test_statement_with_no_property_counts_as_the_managers(
        self, db: AsyncSession, owner: User, org: Organization,
    ) -> None:
        managed = await self._property(db, org, owner, 'Elm St')
        await self._transaction(db, org, owner, 'management_fee', managed.id)
        await self._booking(db, org, 'airbnb')
        assert [item for item in await self._checklist(org, owner) if item[0] == '1099_k'] == []

    @pytest.mark.asyncio
    async def test_three_properties_read_as_a_list(self, db: AsyncSession, owner: User, org: Organization) -> None:
        for name in ['Elm St', 'Oak St', 'Ash St']:
            prop = await self._property(db, org, owner, name)
            await self._transaction(db, org, owner, 'mortgage_interest', prop.id)
        result = await tax_return_service.list_all_source_documents(_make_ctx(org, owner), tax_year=2025)
        assert result.checklist[0].reason == (
            'Mortgage interest transactions exist for Ash St, Elm St and Oak St. I have 0 of 3 1098s'
        )
