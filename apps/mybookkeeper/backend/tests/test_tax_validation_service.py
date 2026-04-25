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
from app.models.properties.property_classification import PropertyClassification
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

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
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

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
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

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
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

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
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

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
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

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
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

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
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

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        salt_errors = [r for r in results if r.form_name == "schedule_a" and r.severity == "error"]
        assert len(salt_errors) == 1
        assert "SALT cap" in salt_errors[0].message


class TestPersonalUseDaysValidation:
    @pytest.mark.asyncio
    async def test_warns_when_personal_use_exceeds_threshold(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = Property(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Vacation Rental",
            address="123 Beach Dr",
            type=PropertyType.SHORT_TERM,
            classification=PropertyClassification.INVESTMENT,
            personal_use_days=20,
            is_active=True,
        )
        db.add(prop)

        tr = _make_return(test_org)
        db.add(tr)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        personal_use_warnings = [
            r for r in results
            if "§280A" in r.message and r.severity == "warning"
        ]
        assert len(personal_use_warnings) == 1
        assert "123 Beach Dr" in personal_use_warnings[0].message
        assert "20 personal use days" in personal_use_warnings[0].message

    @pytest.mark.asyncio
    async def test_no_warning_when_below_threshold(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = Property(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Rental Prop",
            type=PropertyType.SHORT_TERM,
            classification=PropertyClassification.INVESTMENT,
            personal_use_days=10,
            is_active=True,
        )
        db.add(prop)

        tr = _make_return(test_org)
        db.add(tr)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        personal_use_warnings = [r for r in results if "§280A" in r.message]
        assert len(personal_use_warnings) == 0

    @pytest.mark.asyncio
    async def test_uses_greater_of_threshold_with_rental_days(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """With 200 rental days, threshold = max(14, 20) = 20. 18 personal days < 20 → no warning."""
        prop = Property(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            name="High Rental Prop",
            type=PropertyType.SHORT_TERM,
            classification=PropertyClassification.INVESTMENT,
            personal_use_days=18,
            is_active=True,
        )
        db.add(prop)

        tr = _make_return(test_org)
        db.add(tr)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        # Mock rental nights since SQLite doesn't support Computed columns
        async def _mock_nights(*_args, **_kwargs):
            return {prop.id: 200}

        with (
            patch("app.services.tax.tax_validation.unit_of_work", _fake),
            patch("app.services.tax.tax_validation.rental_rules.reservation_repo.total_nights_by_property", _mock_nights),
        ):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        personal_use_warnings = [r for r in results if "§280A" in r.message]
        assert len(personal_use_warnings) == 0

    @pytest.mark.asyncio
    async def test_no_warning_when_zero_personal_days(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = Property(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Full Rental",
            type=PropertyType.SHORT_TERM,
            classification=PropertyClassification.INVESTMENT,
            personal_use_days=0,
            is_active=True,
        )
        db.add(prop)

        tr = _make_return(test_org)
        db.add(tr)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        personal_use_warnings = [r for r in results if "§280A" in r.message]
        assert len(personal_use_warnings) == 0


class TestSecurityDepositValidation:
    @pytest.mark.asyncio
    async def test_info_when_security_deposits_exist(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        prop = Property(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Deposit Prop",
            type=PropertyType.LONG_TERM,
        )
        db.add(prop)
        await db.flush()

        txn = Transaction(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            transaction_date=date(2025, 3, 1),
            tax_year=2025,
            amount=Decimal("2000.00"),
            transaction_type="income",
            category="security_deposit",
            status="approved",
        )
        db.add(txn)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        deposit_info = [
            r for r in results
            if "security deposit" in r.message.lower() and r.severity == "info"
        ]
        assert len(deposit_info) == 1
        assert "not taxable income" in deposit_info[0].message
        assert "reclassify" in deposit_info[0].message.lower()

    @pytest.mark.asyncio
    async def test_no_info_when_no_security_deposits(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        deposit_info = [r for r in results if "security deposit" in r.message.lower()]
        assert len(deposit_info) == 0


class TestPassiveActivityLossValidation:
    @pytest.mark.asyncio
    async def test_warns_on_schedule_e_net_loss(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        aggregate = _make_instance(
            tr, "schedule_e", "computed", instance_label="Total (all properties)",
        )
        db.add(aggregate)
        await db.flush()

        db.add(_make_field(
            aggregate, "line_26", "Total rental income",
            value_numeric=Decimal("-15000.00"),
        ))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        pal_warnings = [
            r for r in results
            if "passive activity" in r.message.lower() and r.severity == "warning"
        ]
        assert len(pal_warnings) == 1
        assert "$25,000" in pal_warnings[0].message
        assert "$100,000" in pal_warnings[0].message
        assert "$150,000" in pal_warnings[0].message
        assert "Form 8582" in pal_warnings[0].message

    @pytest.mark.asyncio
    async def test_no_warning_on_positive_schedule_e(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        aggregate = _make_instance(
            tr, "schedule_e", "computed", instance_label="Total (all properties)",
        )
        db.add(aggregate)
        await db.flush()

        db.add(_make_field(
            aggregate, "line_26", "Total rental income",
            value_numeric=Decimal("5000.00"),
        ))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        pal_warnings = [r for r in results if "passive activity" in r.message.lower()]
        assert len(pal_warnings) == 0


class TestSEWageBaseValidation:
    @pytest.mark.asyncio
    async def test_warns_on_unconfigured_tax_year(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org, tax_year=2030)
        db.add(tr)
        await db.flush()

        # SE wage base warning only fires when Schedule C shows positive net profit
        sched_c = _make_instance(tr, "schedule_c", "computed", instance_label="Consulting")
        db.add(sched_c)
        await db.flush()
        db.add(_make_field(sched_c, "line_29_net_profit", "Net profit", value_numeric=Decimal("50000.00")))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        wage_warnings = [
            r for r in results
            if "wage base" in r.message.lower() and r.severity == "warning"
        ]
        assert len(wage_warnings) == 1
        assert "2030" in wage_warnings[0].message

    @pytest.mark.asyncio
    async def test_no_warning_for_configured_year(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org, tax_year=2025)
        db.add(tr)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        wage_warnings = [r for r in results if "wage base" in r.message.lower()]
        assert len(wage_warnings) == 0


class TestSSOvercapping:
    @pytest.mark.asyncio
    async def test_warns_on_multiple_w2s_exceeding_wage_base(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        w2_1 = _make_instance(tr, "w2", "extracted", instance_label="Employer A")
        w2_2 = _make_instance(tr, "w2", "extracted", instance_label="Employer B")
        db.add_all([w2_1, w2_2])
        await db.flush()

        db.add(_make_field(w2_1, "box_3", "SS wages", value_numeric=Decimal("100000.00")))
        db.add(_make_field(w2_2, "box_3", "SS wages", value_numeric=Decimal("90000.00")))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        ss_warnings = [r for r in results if "social security" in r.message.lower() and r.severity == "warning"]
        assert len(ss_warnings) == 1
        assert "overpaid" in ss_warnings[0].message
        assert "1040" == ss_warnings[0].form_name

    @pytest.mark.asyncio
    async def test_no_warning_single_w2(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        w2 = _make_instance(tr, "w2", "extracted")
        db.add(w2)
        await db.flush()
        db.add(_make_field(w2, "box_3", "SS wages", value_numeric=Decimal("200000.00")))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        ss_warnings = [r for r in results if "social security" in r.message.lower() and "overpaid" in r.message.lower()]
        assert len(ss_warnings) == 0


class TestNECWithoutScheduleC:
    @pytest.mark.asyncio
    async def test_warns_on_nec_without_schedule_c(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        nec = _make_instance(tr, "1099_nec", "extracted")
        db.add(nec)
        await db.flush()
        db.add(_make_field(nec, "box_1", "NEC income", value_numeric=Decimal("25000.00")))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        nec_warnings = [r for r in results if "1099-nec" in r.message.lower() and r.severity == "warning"]
        assert len(nec_warnings) == 1
        assert "schedule c" in nec_warnings[0].message.lower()


class TestSEDeductionMissing:
    @pytest.mark.asyncio
    async def test_warns_when_se_deduction_not_on_schedule_1(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        se = _make_instance(tr, "schedule_se", "computed")
        db.add(se)
        await db.flush()
        db.add(_make_field(se, "deductible_half", "Deductible half", value_numeric=Decimal("3000.00")))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        se_warnings = [r for r in results if "se tax deduction" in r.message.lower() and r.severity == "warning"]
        assert len(se_warnings) == 1
        assert "schedule 1" in se_warnings[0].message.lower()


class TestRentalIncomeWithoutExpenses:
    @pytest.mark.asyncio
    async def test_warns_on_high_income_low_expenses(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop_id = uuid.uuid4()
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        inst = _make_instance(tr, "schedule_e", "computed", property_id=prop_id, instance_label="123 Main St")
        db.add(inst)
        await db.flush()
        db.add(_make_field(inst, "line_3", "Rents received", value_numeric=Decimal("30000.00")))
        db.add(_make_field(inst, "line_20", "Total expenses", value_numeric=Decimal("500.00")))
        db.add(_make_field(inst, "line_21", "Net income", value_numeric=Decimal("29500.00")))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        expense_warnings = [r for r in results if "rental income" in r.message.lower() and "expenses" in r.message.lower()]
        assert len(expense_warnings) == 1
        assert "insurance" in expense_warnings[0].message.lower()


class TestUncategorizedTransactions:
    @pytest.mark.asyncio
    async def test_warns_on_uncategorized_transactions(
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
            transaction_date=date(2025, 5, 1),
            tax_year=2025,
            amount=Decimal("750.00"),
            transaction_type="expense",
            category="uncategorized",
            status="approved",
        )
        db.add(txn)
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        uncat = [r for r in results if "uncategorized" in r.message.lower() and r.severity == "warning"]
        assert len(uncat) == 1
        assert "1 approved" in uncat[0].message


class TestStandardVsItemized:
    @pytest.mark.asyncio
    async def test_warns_when_standard_is_better(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        sa = _make_instance(tr, "schedule_a", "manual")
        db.add(sa)
        await db.flush()
        db.add(_make_field(sa, "line_5a", "SALT", value_numeric=Decimal("5000.00")))
        db.add(_make_field(sa, "line_8a", "Mortgage interest", value_numeric=Decimal("3000.00")))
        await db.commit()

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.tax.tax_validation.unit_of_work", _fake):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        std_warnings = [r for r in results if "standard deduction" in r.message.lower() and r.severity == "warning"]
        assert len(std_warnings) == 1
        assert "$15,000" in std_warnings[0].message
