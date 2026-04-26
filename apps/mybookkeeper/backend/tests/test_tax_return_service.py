"""Tests for tax_return_service — CRUD and field override operations."""
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.user.user import User
from app.services.tax import tax_return_service


def _make_ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(
        organization_id=org.id,
        user_id=user.id,
        org_role="owner",
    )


class TestListReturns:
    @pytest.mark.asyncio
    async def test_lists_empty(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_return_service.AsyncSessionLocal", _fake), patch("app.services.tax.tax_return_service.unit_of_work", _fake):
            results = await tax_return_service.list_returns(ctx)
        assert results == []

    @pytest.mark.asyncio
    async def test_lists_existing(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_return_service.AsyncSessionLocal", _fake), patch("app.services.tax.tax_return_service.unit_of_work", _fake):
            results = await tax_return_service.list_returns(ctx)
        assert len(results) == 1
        assert results[0].tax_year == 2025


class TestCreateReturn:
    @pytest.mark.asyncio
    async def test_creates_new_return(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_return_service.AsyncSessionLocal", _fake), patch("app.services.tax.tax_return_service.unit_of_work", _fake):
            result = await tax_return_service.create_return(ctx, 2025)
        assert result.tax_year == 2025
        assert result.filing_status == "single"
        assert result.organization_id == test_org.id

    @pytest.mark.asyncio
    async def test_rejects_duplicate_year(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_return_service.AsyncSessionLocal", _fake), patch("app.services.tax.tax_return_service.unit_of_work", _fake):
            with pytest.raises(ValueError, match="already exists"):
                await tax_return_service.create_return(ctx, 2025)


class TestGetReturn:
    @pytest.mark.asyncio
    async def test_returns_by_id(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_return_service.AsyncSessionLocal", _fake), patch("app.services.tax.tax_return_service.unit_of_work", _fake):
            result = await tax_return_service.get_return(ctx, tr.id)
        assert result is not None
        assert result.id == tr.id

    @pytest.mark.asyncio
    async def test_returns_none_for_missing(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_return_service.AsyncSessionLocal", _fake), patch("app.services.tax.tax_return_service.unit_of_work", _fake):
            result = await tax_return_service.get_return(ctx, uuid.uuid4())
        assert result is None


class TestGetFormInstances:
    @pytest.mark.asyncio
    async def test_returns_form_shape(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.flush()

        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name="schedule_e",
            source_type="computed",
            instance_label="123 Test St",
        )
        db.add(inst)
        await db.flush()

        field = TaxFormField(
            id=uuid.uuid4(),
            form_instance_id=inst.id,
            field_id="line_3",
            field_label="Rents received",
            value_numeric=Decimal("42500.00"),
            is_calculated=True,
        )
        db.add(field)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_return_service.AsyncSessionLocal", _fake), patch("app.services.tax.tax_return_service.unit_of_work", _fake):
            result = await tax_return_service.get_form_instances(
                ctx, tr.id, "schedule_e",
            )

        assert result["form_name"] == "schedule_e"
        assert len(result["instances"]) == 1
        assert result["instances"][0]["instance_label"] == "123 Test St"
        assert len(result["instances"][0]["fields"]) == 1

        f = result["instances"][0]["fields"][0]
        assert f["field_id"] == "line_3"
        assert f["value"] == 42500.00
        assert f["id"] == str(field.id)
        assert f["confidence"] is None
        # field_label == field_id, so label should be humanized
        assert f["label"] == "Rents received"


class TestOverrideField:
    @pytest.mark.asyncio
    async def test_overrides_field_value(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.flush()

        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name="schedule_e",
            source_type="computed",
        )
        db.add(inst)
        await db.flush()

        field = TaxFormField(
            id=uuid.uuid4(),
            form_instance_id=inst.id,
            field_id="line_3",
            field_label="Rents received",
            value_numeric=Decimal("42500.00"),
            is_calculated=True,
        )
        db.add(field)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_return_service.AsyncSessionLocal", _fake), patch("app.services.tax.tax_return_service.unit_of_work", _fake):
            result = await tax_return_service.override_field(
                ctx, tr.id, field.id,
                value_numeric=Decimal("45000.00"),
                override_reason="Manual correction",
            )

        assert result.is_overridden is True
        assert result.value_numeric == Decimal("45000.00")
        assert result.override_reason == "Manual correction"

    @pytest.mark.asyncio
    async def test_rejects_field_from_wrong_return(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)

        tr1 = TaxReturn(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            tax_year=2025,
        )
        tr2 = TaxReturn(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            tax_year=2024,
        )
        db.add_all([tr1, tr2])
        await db.flush()

        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr2.id,
            form_name="schedule_e",
            source_type="computed",
        )
        db.add(inst)
        await db.flush()

        field = TaxFormField(
            id=uuid.uuid4(),
            form_instance_id=inst.id,
            field_id="line_3",
            field_label="Rents received",
            value_numeric=Decimal("1000.00"),
        )
        db.add(field)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_return_service.AsyncSessionLocal", _fake), patch("app.services.tax.tax_return_service.unit_of_work", _fake):
            with pytest.raises(LookupError, match="does not belong"):
                await tax_return_service.override_field(
                    ctx, tr1.id, field.id,
                    value_numeric=Decimal("2000.00"),
                )

    @pytest.mark.asyncio
    async def test_overrides_boolean_field(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.flush()

        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name="schedule_e",
            source_type="computed",
        )
        db.add(inst)
        await db.flush()

        field = TaxFormField(
            id=uuid.uuid4(),
            form_instance_id=inst.id,
            field_id="is_passive",
            field_label="Passive activity",
            value_boolean=False,
        )
        db.add(field)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_return_service.AsyncSessionLocal", _fake), patch("app.services.tax.tax_return_service.unit_of_work", _fake):
            result = await tax_return_service.override_field(
                ctx, tr.id, field.id,
                value_boolean=True,
                override_reason="Corrected activity type",
            )

        assert result.is_overridden is True
        assert result.value_boolean is True
        assert result.override_reason == "Corrected activity type"


class TestGetFormInstancesPiiMasking:
    @pytest.mark.asyncio
    async def test_masks_ssn_field(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.flush()

        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name="w2",
            source_type="extracted",
            instance_label="Employer Inc",
        )
        db.add(inst)
        await db.flush()

        field = TaxFormField(
            id=uuid.uuid4(),
            form_instance_id=inst.id,
            field_id="ssn",
            field_label="Social Security Number",
            value_text="123-45-6789",
        )
        db.add(field)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_return_service.AsyncSessionLocal", _fake), patch("app.services.tax.tax_return_service.unit_of_work", _fake):
            result = await tax_return_service.get_form_instances(
                ctx, tr.id, "w2",
            )

        f = result["instances"][0]["fields"][0]
        assert f["value"] == "***6789"
        assert f["label"] == "Social Security Number"

    @pytest.mark.asyncio
    async def test_humanizes_label_when_same_as_field_id(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        tr = TaxReturn(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            tax_year=2025,
        )
        db.add(tr)
        await db.flush()

        inst = TaxFormInstance(
            id=uuid.uuid4(),
            tax_return_id=tr.id,
            form_name="1099_misc",
            source_type="extracted",
            instance_label="Test",
        )
        db.add(inst)
        await db.flush()

        field = TaxFormField(
            id=uuid.uuid4(),
            form_instance_id=inst.id,
            field_id="recipient_tin",
            field_label="recipient_tin",
            value_text="123456789",
        )
        db.add(field)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_return_service.AsyncSessionLocal", _fake), patch("app.services.tax.tax_return_service.unit_of_work", _fake):
            result = await tax_return_service.get_form_instances(
                ctx, tr.id, "1099_misc",
            )

        f = result["instances"][0]["fields"][0]
        # Label should be humanized since field_label == field_id
        assert f["label"] == "Recipient Tin"
        # Value should be masked since recipient_tin is a PII field
        assert f["value"] == "***6789"
