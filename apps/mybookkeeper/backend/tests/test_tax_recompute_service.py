"""Tests for tax_recompute_service — schedule E, 4562, and 1040 aggregation."""
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
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
from app.repositories import tax_return_repo


def _make_property(
    org: Organization, user: User, **kwargs,
) -> Property:
    defaults = dict(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        name="Test Property",
        address="123 Test St",
        classification=PropertyClassification.INVESTMENT,
        type=PropertyType.SHORT_TERM,
    )
    defaults.update(kwargs)
    return Property(**defaults)


def _make_transaction(
    org: Organization, user: User, prop: Property, **kwargs,
) -> Transaction:
    defaults = dict(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        property_id=prop.id,
        transaction_date=date(2025, 6, 15),
        tax_year=2025,
        amount=Decimal("100.00"),
        transaction_type="expense",
        category="maintenance",
        schedule_e_line="line_7_cleaning_maintenance",
        status="approved",
        tax_relevant=True,
    )
    defaults.update(kwargs)
    return Transaction(**defaults)


def _make_tax_return(org: Organization, tax_year: int = 2025) -> TaxReturn:
    return TaxReturn(
        id=uuid.uuid4(),
        organization_id=org.id,
        tax_year=tax_year,
        filing_status="single",
        needs_recompute=True,
    )


class TestComputeScheduleE:
    @pytest.mark.asyncio
    async def test_creates_schedule_e_from_transactions(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = _make_property(test_org, test_user)
        db.add(prop)
        await db.flush()

        tax_return = _make_tax_return(test_org)
        db.add(tax_return)
        await db.flush()

        # Income transaction
        income_txn = _make_transaction(
            test_org, test_user, prop,
            amount=Decimal("5000.00"),
            transaction_type="income",
            category="rental_revenue",
            schedule_e_line="line_3_rents_received",
        )
        db.add(income_txn)

        # Expense transactions
        expense_txn = _make_transaction(
            test_org, test_user, prop,
            amount=Decimal("300.00"),
            transaction_type="expense",
            category="maintenance",
            schedule_e_line="line_7_cleaning_maintenance",
        )
        db.add(expense_txn)

        insurance_txn = _make_transaction(
            test_org, test_user, prop,
            amount=Decimal("200.00"),
            transaction_type="expense",
            category="insurance",
            schedule_e_line="line_9_insurance",
        )
        db.add(insurance_txn)
        await db.commit()

        from app.services.tax import tax_recompute_service

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.tax.tax_recompute_service.unit_of_work", _fake),
            patch("app.services.tax.tax_validation.unit_of_work", _fake),
        ):
            forms_updated = await tax_recompute_service.recompute(
                test_org.id, tax_return.id,
            )

        assert forms_updated >= 1

        instances = await tax_return_repo.get_form_instances(
            db, tax_return.id, "schedule_e",
        )
        property_instances = [i for i in instances if i.property_id == prop.id]
        assert len(property_instances) == 1

        inst = property_instances[0]
        field_map = {f.field_id: f.value_numeric for f in inst.fields}

        assert field_map.get("line_3") == Decimal("5000.00")
        assert field_map.get("line_7") == Decimal("300.00")
        assert field_map.get("line_9") == Decimal("200.00")
        assert field_map.get("line_20") == Decimal("500.00")
        assert field_map.get("line_21") == Decimal("4500.00")

    @pytest.mark.asyncio
    async def test_idempotent_recompute(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Running recompute twice produces the same result."""
        prop = _make_property(test_org, test_user)
        db.add(prop)
        await db.flush()

        tax_return = _make_tax_return(test_org)
        db.add(tax_return)
        await db.flush()

        txn = _make_transaction(
            test_org, test_user, prop,
            amount=Decimal("1000.00"),
            transaction_type="income",
            category="rental_revenue",
            schedule_e_line="line_3_rents_received",
        )
        db.add(txn)
        await db.commit()

        from app.services.tax import tax_recompute_service

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.tax.tax_recompute_service.unit_of_work", _fake),
            patch("app.services.tax.tax_validation.unit_of_work", _fake),
        ):
            await tax_recompute_service.recompute(test_org.id, tax_return.id)
            await tax_recompute_service.recompute(test_org.id, tax_return.id)

        instances = await tax_return_repo.get_form_instances(
            db, tax_return.id, "schedule_e",
        )
        property_instances = [i for i in instances if i.property_id == prop.id]
        assert len(property_instances) == 1

    @pytest.mark.asyncio
    async def test_sets_needs_recompute_false(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        tax_return = _make_tax_return(test_org)
        db.add(tax_return)
        await db.commit()

        from app.services.tax import tax_recompute_service

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.tax.tax_recompute_service.unit_of_work", _fake),
            patch("app.services.tax.tax_validation.unit_of_work", _fake),
        ):
            await tax_recompute_service.recompute(test_org.id, tax_return.id)

        await db.refresh(tax_return)
        assert tax_return.needs_recompute is False


class TestComputeForm4562:
    @pytest.mark.asyncio
    async def test_calculates_residential_depreciation(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = _make_property(
            test_org, test_user,
            purchase_price=Decimal("300000.00"),
            land_value=Decimal("50000.00"),
            date_placed_in_service=date(2020, 1, 1),
            property_class="residential_27_5",
        )
        db.add(prop)
        await db.flush()

        tax_return = _make_tax_return(test_org)
        db.add(tax_return)
        await db.commit()

        from app.services.tax import tax_recompute_service

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.tax.tax_recompute_service.unit_of_work", _fake),
            patch("app.services.tax.tax_validation.unit_of_work", _fake),
        ):
            await tax_recompute_service.recompute(test_org.id, tax_return.id)

        instances = await tax_return_repo.get_form_instances(
            db, tax_return.id, "form_4562",
        )
        assert len(instances) == 1

        field_map = {f.field_id: f.value_numeric for f in instances[0].fields}
        expected_depreciation = (Decimal("250000.00") / Decimal("27.5")).quantize(Decimal("0.01"))
        assert field_map["depreciation_amount"] == expected_depreciation
        assert field_map["depreciable_basis"] == Decimal("250000.00")

    @pytest.mark.asyncio
    async def test_commercial_39_year_depreciation(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = _make_property(
            test_org, test_user,
            purchase_price=Decimal("500000.00"),
            land_value=Decimal("100000.00"),
            date_placed_in_service=date(2020, 1, 1),
            property_class="commercial_39",
        )
        db.add(prop)
        await db.flush()

        tax_return = _make_tax_return(test_org)
        db.add(tax_return)
        await db.commit()

        from app.services.tax import tax_recompute_service

        @asynccontextmanager
        async def _fake():
            yield db

        with (
            patch("app.services.tax.tax_recompute_service.unit_of_work", _fake),
            patch("app.services.tax.tax_validation.unit_of_work", _fake),
        ):
            await tax_recompute_service.recompute(test_org.id, tax_return.id)

        instances = await tax_return_repo.get_form_instances(
            db, tax_return.id, "form_4562",
        )
        assert len(instances) == 1

        field_map = {f.field_id: f.value_numeric for f in instances[0].fields}
        expected = (Decimal("400000.00") / Decimal("39")).quantize(Decimal("0.01"))
        assert field_map["depreciation_amount"] == expected
