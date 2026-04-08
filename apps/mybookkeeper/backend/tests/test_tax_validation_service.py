"""Tests for tax_validation_service — cross-document validation rules."""
import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.tax import tax_validation_service


def _make_return(org: Organization, tax_year: int = 2025) -> TaxReturn:
    return TaxReturn(
        id=uuid.uuid4(),
        organization_id=org.id,
        tax_year=tax_year,
        filing_status="single",
    )


def _make_instance(
    tax_return: TaxReturn, form_name: str, source_type: str = "computed", **kwargs,
) -> TaxFormInstance:
    defaults = dict(
        id=uuid.uuid4(),
        tax_return_id=tax_return.id,
        form_name=form_name,
        source_type=source_type,
    )
    defaults.update(kwargs)
    return TaxFormInstance(**defaults)


def _make_field(
    instance: TaxFormInstance, field_id: str, label: str, **kwargs,
) -> TaxFormField:
    defaults = dict(
        id=uuid.uuid4(),
        form_instance_id=instance.id,
        field_id=field_id,
        field_label=label,
    )
    defaults.update(kwargs)
    return TaxFormField(**defaults)


class TestW2WagesValidation:
    @pytest.mark.asyncio
    async def test_warns_when_w2_mismatch(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        w2_inst = _make_instance(tr, "w2", "extracted")
        db.add(w2_inst)
        await db.flush()

        w2_field = _make_field(
            w2_inst, "box_1", "Wages", value_numeric=Decimal("50000.00"),
        )
        db.add(w2_field)

        inst_1040 = _make_instance(tr, "1040", "computed")
        db.add(inst_1040)
        await db.flush()

        line_1a = _make_field(
            inst_1040, "line_1a", "Wages", value_numeric=Decimal("45000.00"),
        )
        db.add(line_1a)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation_service.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        wage_errors = [r for r in results if r.form_name == "1040" and r.field_id == "line_1a" and r.severity == "error"]
        assert len(wage_errors) == 1
        assert "does not match" in wage_errors[0].message

    @pytest.mark.asyncio
    async def test_passes_when_w2_matches(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        w2_inst = _make_instance(tr, "w2", "extracted")
        db.add(w2_inst)
        await db.flush()

        db.add(_make_field(w2_inst, "box_1", "Wages", value_numeric=Decimal("50000.00")))

        inst_1040 = _make_instance(tr, "1040", "computed")
        db.add(inst_1040)
        await db.flush()

        db.add(_make_field(inst_1040, "line_1a", "Wages", value_numeric=Decimal("50000.00")))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation_service.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        wage_results = [r for r in results if r.form_name == "1040" and r.field_id == "line_1a"]
        assert all(r.severity == "info" for r in wage_results)


class TestScheduleEMathValidation:
    @pytest.mark.asyncio
    async def test_detects_math_error(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop_id = uuid.uuid4()
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        inst = _make_instance(tr, "schedule_e", "computed", property_id=prop_id)
        db.add(inst)
        await db.flush()

        db.add(_make_field(inst, "line_3", "Rents received", value_numeric=Decimal("5000.00")))
        db.add(_make_field(inst, "line_20", "Total expenses", value_numeric=Decimal("1000.00")))
        # Intentionally wrong line_21
        db.add(_make_field(inst, "line_21", "Net income", value_numeric=Decimal("3000.00")))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation_service.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        math_errors = [r for r in results if r.field_id == "line_21" and r.severity == "error"]
        assert len(math_errors) == 1
        assert "math error" in math_errors[0].message

    @pytest.mark.asyncio
    async def test_passes_correct_math(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop_id = uuid.uuid4()
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        inst = _make_instance(tr, "schedule_e", "computed", property_id=prop_id)
        db.add(inst)
        await db.flush()

        db.add(_make_field(inst, "line_3", "Rents received", value_numeric=Decimal("5000.00")))
        db.add(_make_field(inst, "line_20", "Total expenses", value_numeric=Decimal("1000.00")))
        db.add(_make_field(inst, "line_21", "Net income", value_numeric=Decimal("4000.00")))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation_service.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        math_errors = [r for r in results if r.field_id == "line_21" and r.severity == "error"]
        assert len(math_errors) == 0


class TestMissingDepreciation:
    @pytest.mark.asyncio
    async def test_warns_on_missing_depreciation(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = Property(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Missing Depr Prop",
            type=PropertyType.SHORT_TERM,
            purchase_price=Decimal("200000.00"),
            is_active=True,
        )
        db.add(prop)

        tr = _make_return(test_org)
        db.add(tr)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation_service.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        depr_warnings = [r for r in results if r.form_name == "form_4562" and r.severity == "warning"]
        assert len(depr_warnings) == 1
        assert "Missing Depr Prop" in depr_warnings[0].message


class TestMortgagePrincipalWarning:
    @pytest.mark.asyncio
    async def test_warns_on_mortgage_principal(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        prop = Property(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Test Prop",
            type=PropertyType.SHORT_TERM,
        )
        db.add(prop)
        await db.flush()

        txn = Transaction(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            transaction_date=date(2025, 6, 15),
            tax_year=2025,
            amount=Decimal("1500.00"),
            transaction_type="expense",
            category="mortgage_principal",
            status="approved",
        )
        db.add(txn)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation_service.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        principal_warnings = [
            r for r in results
            if "mortgage principal" in r.message.lower() and r.severity == "warning"
        ]
        assert len(principal_warnings) == 1
        assert "not tax-deductible" in principal_warnings[0].message


class TestDuplicateDocuments:
    @pytest.mark.asyncio
    async def test_detects_duplicate_ein_amount(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        inst1 = _make_instance(
            tr, "w2", "extracted", issuer_ein="12-3456789", instance_label="Employer A",
        )
        inst2 = _make_instance(
            tr, "w2", "extracted", issuer_ein="12-3456789", instance_label="Employer A Copy",
        )
        db.add_all([inst1, inst2])
        await db.flush()

        db.add(_make_field(inst1, "box_1", "Wages", value_numeric=Decimal("50000.00")))
        db.add(_make_field(inst2, "box_1", "Wages", value_numeric=Decimal("50000.00")))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation_service.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        dup_warnings = [r for r in results if "duplicate" in r.message.lower()]
        assert len(dup_warnings) >= 1


class TestSALTCap:
    @pytest.mark.asyncio
    async def test_errors_on_salt_over_limit(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        inst = _make_instance(tr, "schedule_a", "manual")
        db.add(inst)
        await db.flush()

        db.add(_make_field(inst, "line_5d", "SALT deduction", value_numeric=Decimal("15000.00")))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation_service.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        salt_errors = [r for r in results if r.form_name == "schedule_a" and r.severity == "error"]
        assert len(salt_errors) == 1
        assert "SALT cap" in salt_errors[0].message
