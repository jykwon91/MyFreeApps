"""Tests for P1 and P2 tax validation rules (rules 20-44)."""
import datetime
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.tax.tax_carryforward import TaxCarryforward
from app.models.tax.estimated_tax_payment import EstimatedTaxPayment
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.tax import tax_validation_service


def _make_return(org: Organization, tax_year: int = 2025, filing_status: str = "single") -> TaxReturn:
    return TaxReturn(
        id=uuid.uuid4(),
        organization_id=org.id,
        tax_year=tax_year,
        filing_status=filing_status,
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


def _fake_uow(db):
    @asynccontextmanager
    async def _fake():
        yield db
    return _fake


# ---------------------------------------------------------------------------
# P1 Rules
# ---------------------------------------------------------------------------


class TestW2WithholdingEstimation:
    """Rule 20: W-2 over/underwithholding estimation."""

    @pytest.mark.asyncio
    async def test_overwithholding_detected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        w2 = _make_instance(tr, "w2", "extracted")
        db.add(w2)
        await db.flush()
        db.add(_make_field(w2, "box_1", "Wages", value_numeric=Decimal("80000.00")))
        db.add(_make_field(w2, "box_2", "Withheld", value_numeric=Decimal("20000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        overwith = [r for r in results if "overwithholding" in r.message.lower()]
        assert len(overwith) == 1
        assert overwith[0].severity == "info"

    @pytest.mark.asyncio
    async def test_underwithholding_detected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        w2 = _make_instance(tr, "w2", "extracted")
        db.add(w2)
        await db.flush()
        db.add(_make_field(w2, "box_1", "Wages", value_numeric=Decimal("200000.00")))
        db.add(_make_field(w2, "box_2", "Withheld", value_numeric=Decimal("25000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        underwith = [r for r in results if "underpayment" in r.message.lower()]
        assert len(underwith) == 1
        assert underwith[0].severity == "warning"


class TestPALCarryforward:
    """Rule 21: Passive activity loss carryforward."""

    @pytest.mark.asyncio
    async def test_warns_on_unused_pal_with_passive_income(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        se = _make_instance(tr, "schedule_e", "computed")
        db.add(se)
        await db.flush()
        db.add(_make_field(se, "line_26", "Total rental", value_numeric=Decimal("15000.00")))

        cf = TaxCarryforward(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            tax_return_id=tr.id,
            carryforward_type="passive_activity_loss",
            from_year=2024,
            to_year=2025,
            amount=Decimal("10000.00"),
            amount_used=Decimal("0.00"),
            remaining=Decimal("10000.00"),
        )
        db.add(cf)
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        pal = [r for r in results if "passive activity loss carryforward" in r.message.lower() and "offset" in r.message.lower()]
        assert len(pal) == 1
        assert pal[0].severity == "warning"


class TestCapitalLossCarryforward:
    """Rule 22: Capital loss carryforward."""

    @pytest.mark.asyncio
    async def test_warns_on_unused_capital_loss(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        cf = TaxCarryforward(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            tax_return_id=tr.id,
            carryforward_type="capital_loss",
            from_year=2024,
            to_year=2025,
            amount=Decimal("8000.00"),
            amount_used=Decimal("0.00"),
            remaining=Decimal("8000.00"),
        )
        db.add(cf)
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        cap = [r for r in results if "capital loss carryforward" in r.message.lower()]
        assert len(cap) == 1
        assert "$3,000" in cap[0].message


class TestEstimatedTaxPenalty:
    """Rule 23: Estimated tax penalty risk."""

    @pytest.mark.asyncio
    async def test_warns_no_estimated_payments(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        sc = _make_instance(tr, "schedule_c", "computed")
        db.add(sc)
        await db.flush()
        db.add(_make_field(sc, "line_29_net_profit", "Net profit", value_numeric=Decimal("50000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        est = [r for r in results if "estimated tax" in r.message.lower() and "no estimated" in r.message.lower()]
        assert len(est) == 1
        assert est[0].severity == "warning"

    @pytest.mark.asyncio
    async def test_no_warning_with_4_payments(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        sc = _make_instance(tr, "schedule_c", "computed")
        db.add(sc)
        await db.flush()
        db.add(_make_field(sc, "line_29_net_profit", "Net profit", value_numeric=Decimal("50000.00")))

        for q in range(1, 5):
            db.add(EstimatedTaxPayment(
                id=uuid.uuid4(),
                organization_id=test_org.id,
                user_id=test_user.id,
                tax_year=2025,
                quarter=q,
                amount=Decimal("3000.00"),
                payment_date=datetime.date(2025, q * 3, 15),
                jurisdiction="federal",
            ))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        est = [r for r in results if "no estimated tax" in r.message.lower()]
        assert len(est) == 0


class TestNIIT:
    """Rule 24: Net Investment Income Tax."""

    @pytest.mark.asyncio
    async def test_warns_high_income_with_investments(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        w2 = _make_instance(tr, "w2", "extracted")
        db.add(w2)
        await db.flush()
        db.add(_make_field(w2, "box_1", "Wages", value_numeric=Decimal("180000.00")))
        db.add(_make_field(w2, "box_2", "Withheld", value_numeric=Decimal("35000.00")))

        div = _make_instance(tr, "1099_div", "extracted")
        db.add(div)
        await db.flush()
        db.add(_make_field(div, "box_1a", "Dividends", value_numeric=Decimal("50000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        niit = [r for r in results if "niit" in r.message.lower() or "net investment" in r.message.lower()]
        assert len(niit) == 1
        assert niit[0].severity == "warning"


class TestAdditionalMedicare:
    """Rule 25: Additional Medicare Tax."""

    @pytest.mark.asyncio
    async def test_warns_high_earnings(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        w2 = _make_instance(tr, "w2", "extracted")
        db.add(w2)
        await db.flush()
        db.add(_make_field(w2, "box_1", "Wages", value_numeric=Decimal("150000.00")))
        db.add(_make_field(w2, "box_2", "Withheld", value_numeric=Decimal("30000.00")))
        db.add(_make_field(w2, "box_5", "Medicare wages", value_numeric=Decimal("150000.00")))

        se = _make_instance(tr, "schedule_se", "computed")
        db.add(se)
        await db.flush()
        db.add(_make_field(se, "net_earnings", "SE earnings", value_numeric=Decimal("80000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        med = [r for r in results if "additional medicare" in r.message.lower()]
        assert len(med) == 1
        assert med[0].severity == "warning"


class TestQBIOpportunity:
    """Rule 26: QBI deduction opportunity."""

    @pytest.mark.asyncio
    async def test_suggests_qbi_for_rental_income(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        se = _make_instance(tr, "schedule_e", "computed")
        db.add(se)
        await db.flush()
        db.add(_make_field(se, "line_26", "Total rental", value_numeric=Decimal("30000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        qbi = [r for r in results if "qbi" in r.message.lower() or "199a" in r.message.lower()]
        assert len(qbi) == 1
        assert "$6,000" in qbi[0].message  # 20% of 30K


class TestFourteenDayRental:
    """Rule 27: 14-day tax-free rental rule."""

    @pytest.mark.asyncio
    async def test_flags_short_rental_period(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        prop = Property(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Cabin",
            type=PropertyType.SHORT_TERM,
        )
        db.add(prop)
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)), \
             patch("app.services.tax.tax_validation.rental_rules.reservation_repo") as mock_res:
            mock_res.total_nights_by_property = AsyncMock(return_value={prop.id: 10})
            results = await tax_validation_service.validate(test_org.id, tr.id)

        rental_14 = [r for r in results if "280a(g)" in r.message.lower() or "tax-free" in r.message.lower()]
        assert len(rental_14) == 1
        assert "10 days" in rental_14[0].message


class TestRentalWithout1099K:
    """Rule 28: Platform rental income without 1099-K."""

    @pytest.mark.asyncio
    async def test_flags_high_rental_no_1099k(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        se = _make_instance(tr, "schedule_e", "computed")
        db.add(se)
        await db.flush()
        db.add(_make_field(se, "line_3", "Rents received", value_numeric=Decimal("25000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        k = [r for r in results if "1099-k" in r.message.lower() and "no 1099-k" in r.message.lower()]
        assert len(k) == 1


class TestDepreciationDollarImpact:
    """Rule 29: Depreciation dollar impact."""

    @pytest.mark.asyncio
    async def test_quantifies_missing_depreciation(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        prop_id = uuid.uuid4()
        se = _make_instance(tr, "schedule_e", "computed", property_id=prop_id)
        db.add(se)
        await db.flush()
        db.add(_make_field(se, "line_3", "Rents", value_numeric=Decimal("40000.00")))
        db.add(_make_field(se, "line_20", "Expenses", value_numeric=Decimal("15000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        dep = [r for r in results if "depreciation" in r.message.lower() and "no depreciation" in r.message.lower()]
        assert len(dep) == 1
        assert "tax" in dep[0].message.lower()


# ---------------------------------------------------------------------------
# P2 Rules
# ---------------------------------------------------------------------------


class TestYoYExpenseAnomaly:
    """Rule 30: Year-over-year expense anomaly."""

    @pytest.mark.asyncio
    async def test_flags_large_yoy_change(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()
        await db.commit()

        async def _sum_expenses(db, org_id, year):
            return Decimal("10000.00") if year == 2024 else Decimal("20000.00")

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)), \
             patch("app.services.tax.tax_validation.general_rules.transaction_repo") as mock_txn:
            mock_txn.sum_expenses_by_year = AsyncMock(side_effect=_sum_expenses)
            mock_txn.sum_by_category = AsyncMock(return_value=Decimal("0"))
            mock_txn.count_by_category = AsyncMock(return_value=0)
            results = await tax_validation_service.validate(test_org.id, tr.id)

        yoy = [r for r in results if "year-over-year" in r.message.lower() or "increased" in r.message.lower()]
        assert len(yoy) == 1
        assert "100%" in yoy[0].message


class TestCleaningFeeMismatch:
    """Rule 31: Cleaning fee revenue/expense mismatch."""

    @pytest.mark.asyncio
    async def test_flags_revenue_without_expense(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()
        await db.commit()

        async def _sum(db, org_id, year, cat):
            if cat == "cleaning_fee_revenue":
                return Decimal("3000.00")
            return Decimal("0")

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)), \
             patch("app.services.tax.tax_validation.rental_rules.transaction_repo") as mock_txn:
            mock_txn.sum_by_category = AsyncMock(side_effect=_sum)
            mock_txn.count_by_category = AsyncMock(return_value=0)
            mock_txn.sum_expenses_by_year = AsyncMock(return_value=Decimal("0"))
            results = await tax_validation_service.validate(test_org.id, tr.id)

        cleaning = [r for r in results if "cleaning fee revenue" in r.message.lower()]
        assert len(cleaning) == 1


class TestMultiPropertyAllocation:
    """Rule 32: Multi-property expense allocation."""

    @pytest.mark.asyncio
    async def test_flags_property_with_income_no_expenses(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        p1_id, p2_id = uuid.uuid4(), uuid.uuid4()
        se1 = _make_instance(tr, "schedule_e", "computed", property_id=p1_id, instance_label="Prop A")
        se2 = _make_instance(tr, "schedule_e", "computed", property_id=p2_id, instance_label="Prop B")
        db.add_all([se1, se2])
        await db.flush()
        db.add(_make_field(se1, "line_3", "Rents", value_numeric=Decimal("20000.00")))
        db.add(_make_field(se1, "line_20", "Expenses", value_numeric=Decimal("8000.00")))
        db.add(_make_field(se2, "line_3", "Rents", value_numeric=Decimal("15000.00")))
        db.add(_make_field(se2, "line_20", "Expenses", value_numeric=Decimal("0")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        alloc = [r for r in results if "no expenses" in r.message.lower() and "prop b" in r.message.lower()]
        assert len(alloc) == 1


class TestDeMinimis:
    """Rule 33: De minimis safe harbor."""

    @pytest.mark.asyncio
    async def test_suggests_de_minimis_for_capital_improvements(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()
        await db.commit()

        async def _sum(db, org_id, year, cat):
            if cat == "capital_improvement":
                return Decimal("5000.00")
            return Decimal("0")

        async def _count(db, org_id, year, cat):
            if cat == "capital_improvement":
                return 3
            return 0

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)), \
             patch("app.services.tax.tax_validation.deduction_rules.transaction_repo") as mock_txn:
            mock_txn.sum_by_category = AsyncMock(side_effect=_sum)
            mock_txn.count_by_category = AsyncMock(side_effect=_count)
            mock_txn.sum_expenses_by_year = AsyncMock(return_value=Decimal("0"))
            results = await tax_validation_service.validate(test_org.id, tr.id)

        dm = [r for r in results if "de minimis" in r.message.lower()]
        assert len(dm) == 1
        assert "$2,500" in dm[0].message


class TestForeignTaxCredit:
    """Rule 34: Foreign tax credit opportunity."""

    @pytest.mark.asyncio
    async def test_flags_foreign_taxes_paid(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        div = _make_instance(tr, "1099_div", "extracted")
        db.add(div)
        await db.flush()
        db.add(_make_field(div, "box_1a", "Dividends", value_numeric=Decimal("10000.00")))
        db.add(_make_field(div, "box_7", "Foreign tax", value_numeric=Decimal("500.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        ftc = [r for r in results if "foreign tax" in r.message.lower() and "credit" in r.message.lower()]
        assert len(ftc) == 1
        assert "$500.00" in ftc[0].message


class TestEarlyWithdrawalPenalty:
    """Rule 35: Early withdrawal penalty deduction."""

    @pytest.mark.asyncio
    async def test_flags_unclaimed_penalty_deduction(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        int_inst = _make_instance(tr, "1099_int", "extracted")
        db.add(int_inst)
        await db.flush()
        db.add(_make_field(int_inst, "box_1", "Interest", value_numeric=Decimal("2000.00")))
        db.add(_make_field(int_inst, "box_2", "Penalty", value_numeric=Decimal("300.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        penalty = [r for r in results if "early withdrawal" in r.message.lower()]
        assert len(penalty) == 1
        assert penalty[0].severity == "warning"


class TestMortgageInsurancePremium:
    """Rule 36: Mortgage insurance premium deduction."""

    @pytest.mark.asyncio
    async def test_flags_unclaimed_pmi(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        m1098 = _make_instance(tr, "1098", "extracted")
        db.add(m1098)
        await db.flush()
        db.add(_make_field(m1098, "box_1", "Interest", value_numeric=Decimal("8000.00")))
        db.add(_make_field(m1098, "box_5", "PMI", value_numeric=Decimal("1200.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        pmi = [r for r in results if "mortgage insurance" in r.message.lower()]
        assert len(pmi) == 1


class TestMealsDeduction:
    """Rule 37: Meals 50% deduction reminder."""

    @pytest.mark.asyncio
    async def test_reminds_meals_50_percent(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        sc = _make_instance(tr, "schedule_c", "computed")
        db.add(sc)
        await db.flush()
        db.add(_make_field(sc, "line_24b", "Meals", value_numeric=Decimal("2000.00")))
        db.add(_make_field(sc, "line_29_net_profit", "Net profit", value_numeric=Decimal("50000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        meals = [r for r in results if "meals" in r.message.lower() and "50%" in r.message]
        assert len(meals) == 1


class TestHomeOfficeNotClaimed:
    """Rule 38: Home office deduction not claimed."""

    @pytest.mark.asyncio
    async def test_suggests_home_office_for_se(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        sc = _make_instance(tr, "schedule_c", "computed")
        db.add(sc)
        await db.flush()
        db.add(_make_field(sc, "line_29_net_profit", "Net profit", value_numeric=Decimal("60000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        ho = [r for r in results if "home office" in r.message.lower()]
        assert len(ho) == 1


class TestBusinessMileageNotClaimed:
    """Rule 39: Business mileage not claimed."""

    @pytest.mark.asyncio
    async def test_suggests_mileage_for_se(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        sc = _make_instance(tr, "schedule_c", "computed")
        db.add(sc)
        await db.flush()
        db.add(_make_field(sc, "line_29_net_profit", "Net profit", value_numeric=Decimal("40000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        mileage = [r for r in results if "vehicle" in r.message.lower() or "mileage" in r.message.lower()]
        assert len(mileage) == 1


class TestWashSale:
    """Rule 40: Wash sale detection."""

    @pytest.mark.asyncio
    async def test_flags_wash_sale_amount(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        b = _make_instance(tr, "1099_b", "extracted")
        db.add(b)
        await db.flush()
        db.add(_make_field(b, "wash_sale_loss_disallowed", "Wash sale", value_numeric=Decimal("2500.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        ws = [r for r in results if "wash sale" in r.message.lower()]
        assert len(ws) == 1
        assert "$2,500.00" in ws[0].message


class TestStateWithholdingSummary:
    """Rule 41: State tax withholding summary."""

    @pytest.mark.asyncio
    async def test_summarizes_state_withholding(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        w2 = _make_instance(tr, "w2", "extracted")
        db.add(w2)
        await db.flush()
        db.add(_make_field(w2, "box_1", "Wages", value_numeric=Decimal("80000.00")))
        db.add(_make_field(w2, "box_2", "Fed withheld", value_numeric=Decimal("12000.00")))
        db.add(_make_field(w2, "box_17", "State withheld", value_numeric=Decimal("4000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        state = [r for r in results if "state tax withheld" in r.message.lower()]
        assert len(state) == 1
        assert "$4,000.00" in state[0].message


class TestDuplicateEINAcrossForms:
    """Rule 42: Duplicate EIN across form types."""

    @pytest.mark.asyncio
    async def test_flags_ein_across_unexpected_forms(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        inst1 = _make_instance(tr, "1099_div", "extracted", issuer_ein="12-3456789", issuer_name="Acme Corp")
        inst2 = _make_instance(tr, "1099_nec", "extracted", issuer_ein="12-3456789", issuer_name="Acme Corp")
        db.add_all([inst1, inst2])
        await db.flush()
        db.add(_make_field(inst1, "box_1a", "Dividends", value_numeric=Decimal("1000.00")))
        db.add(_make_field(inst2, "box_1", "NEC", value_numeric=Decimal("5000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        dup = [r for r in results if "12-3456789" in r.message and "multiple form types" in r.message.lower()]
        assert len(dup) == 1


class TestPropertyTaxSALT:
    """Rule 43: Property tax SALT allocation."""

    @pytest.mark.asyncio
    async def test_flags_property_tax_on_both_schedules(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        prop_id = uuid.uuid4()
        se = _make_instance(tr, "schedule_e", "computed", property_id=prop_id)
        db.add(se)
        await db.flush()
        db.add(_make_field(se, "line_16", "Taxes", value_numeric=Decimal("3000.00")))
        db.add(_make_field(se, "line_3", "Rents", value_numeric=Decimal("20000.00")))
        db.add(_make_field(se, "line_20", "Expenses", value_numeric=Decimal("10000.00")))

        sa = _make_instance(tr, "schedule_a", "manual")
        db.add(sa)
        await db.flush()
        db.add(_make_field(sa, "line_5b", "RE tax", value_numeric=Decimal("5000.00")))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        salt = [r for r in results if "salt" in r.message.lower() and "rental" in r.message.lower()]
        assert len(salt) == 1


class TestEstimatedPaymentTiming:
    """Rule 44: Estimated payment timing penalties."""

    @pytest.mark.asyncio
    async def test_flags_late_quarterly_payment(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tr = _make_return(test_org)
        db.add(tr)
        await db.flush()

        db.add(EstimatedTaxPayment(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            tax_year=2025,
            quarter=1,
            amount=Decimal("5000.00"),
            payment_date=datetime.date(2025, 6, 1),  # Late — Q1 due April 15
            jurisdiction="federal",
        ))
        await db.commit()

        with patch("app.services.tax.tax_validation.unit_of_work", _fake_uow(db)):
            results = await tax_validation_service.validate(test_org.id, tr.id)

        late = [r for r in results if "late estimated" in r.message.lower()]
        assert len(late) == 1
        assert "Q1" in late[0].message
