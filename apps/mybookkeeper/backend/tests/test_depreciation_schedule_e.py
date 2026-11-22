"""Form 4562 depreciation reaches Schedule E line 18 and everything built on it.

A rental bought for $300,000 with $25,000 of land, placed in service in 2023,
depreciates $10,000 a year (275,000 / 27.5). Before this, recompute wrote that
on Form 4562 but left Schedule E line 18 at zero, so lines 21 and 26 and the
1040 overstated rental income by $10,000.
"""
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
from app.repositories import tax_return_repo
from app.services.tax import tax_recompute_service, tax_validation_service
from app.services.tax.tax_validation_service import ValidationResult

ANNUAL_DEPRECIATION = Decimal("10000.00")
RENT = Decimal("30000.00")
CLEANING = Decimal("2000.00")


def _rental(org: Organization, user: User, **kwargs) -> Property:
    values = dict(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        name="Peerless",
        address="6734 Peerless St",
        classification=PropertyClassification.INVESTMENT,
        type=PropertyType.LONG_TERM,
        purchase_price=Decimal("300000.00"),
        land_value=Decimal("25000.00"),
        date_placed_in_service=date(2023, 3, 15),
    )
    values.update(kwargs)
    return Property(**values)


def _txn(org: Organization, user: User, prop: Property, **kwargs) -> Transaction:
    values = dict(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        property_id=prop.id,
        transaction_date=date(2025, 6, 15),
        tax_year=2025,
        status="approved",
        tax_relevant=True,
    )
    values.update(kwargs)
    return Transaction(**values)


def _rent(org: Organization, user: User, prop: Property) -> Transaction:
    return _txn(
        org, user, prop, amount=RENT, transaction_type="income",
        category="rental_revenue", schedule_e_line="line_3_rents_received",
    )


def _cleaning(org: Organization, user: User, prop: Property) -> Transaction:
    return _txn(
        org, user, prop, amount=CLEANING, transaction_type="expense",
        category="maintenance", schedule_e_line="line_7_cleaning_maintenance",
    )


async def _new_return(db: AsyncSession, org: Organization) -> TaxReturn:
    tax_return = TaxReturn(
        id=uuid.uuid4(), organization_id=org.id, tax_year=2025,
        filing_status="single", needs_recompute=True,
    )
    db.add(tax_return)
    await db.commit()
    return tax_return


async def _recompute(db: AsyncSession, org: Organization, tax_return: TaxReturn) -> list[ValidationResult]:
    @asynccontextmanager
    async def _fake():
        yield db

    with (
        patch("app.services.tax.tax_recompute_service.unit_of_work", _fake),
        patch("app.services.tax.tax_validation.unit_of_work", _fake),
        patch("app.services.tax.tax_validation.AsyncSessionLocal", _fake),
    ):
        await tax_recompute_service.recompute(org.id, tax_return.id)
        return await tax_validation_service.validate(org.id, tax_return.id)


async def _instances(db: AsyncSession, tax_return: TaxReturn, form_name: str) -> list[TaxFormInstance]:
    # Recompute adds fields without touching already-loaded collections; reload them.
    for loaded in list(db.identity_map.values()):
        if isinstance(loaded, (TaxFormInstance, TaxFormField)):
            db.expire(loaded)
    return list(await tax_return_repo.get_form_instances(db, tax_return.id, form_name))


def _values(instance: TaxFormInstance) -> dict[str, Decimal | None]:
    return {f.field_id: f.value_numeric for f in instance.fields}


def _property_schedule_e(instances: list[TaxFormInstance], prop: Property) -> TaxFormInstance:
    return next(i for i in instances if i.property_id == prop.id)


def _line_26(instances: list[TaxFormInstance]) -> Decimal | None:
    aggregate = next(i for i in instances if i.property_id is None)
    return _values(aggregate)["line_26"]


def _no_depreciation_warnings(results: list[ValidationResult]) -> list[ValidationResult]:
    return [r for r in results if "no depreciation claimed" in r.message]


async def _seed_rental(db: AsyncSession, org: Organization, user: User, **kwargs) -> Property:
    prop = _rental(org, user, **kwargs)
    db.add(prop)
    await db.flush()
    db.add_all([_rent(org, user, prop), _cleaning(org, user, prop)])
    await db.flush()
    return prop


class TestDepreciationReachesScheduleE:
    @pytest.mark.asyncio
    async def test_line_18_carries_the_form_4562_amount_through_to_the_1040(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_rental(db, test_org, test_user)
        tax_return = await _new_return(db, test_org)

        await _recompute(db, test_org, tax_return)

        form_4562 = await _instances(db, tax_return, "form_4562")
        assert len(form_4562) == 1
        assert _values(form_4562[0])["depreciation_amount"] == ANNUAL_DEPRECIATION

        schedule_e = await _instances(db, tax_return, "schedule_e")
        lines = _values(_property_schedule_e(schedule_e, prop))
        assert lines["line_18"] == ANNUAL_DEPRECIATION
        assert lines["line_20"] == CLEANING + ANNUAL_DEPRECIATION
        assert lines["line_21"] == RENT - CLEANING - ANNUAL_DEPRECIATION
        assert _line_26(schedule_e) == RENT - CLEANING - ANNUAL_DEPRECIATION

        form_1040 = await _instances(db, tax_return, "1040")
        assert _values(form_1040[0])["line_8"] == RENT - CLEANING - ANNUAL_DEPRECIATION

    @pytest.mark.asyncio
    async def test_line_18_cites_the_form_4562_as_its_source(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_rental(db, test_org, test_user)
        tax_return = await _new_return(db, test_org)

        await _recompute(db, test_org, tax_return)

        form_4562_id = (await _instances(db, tax_return, "form_4562"))[0].id
        schedule_e = await _instances(db, tax_return, "schedule_e")
        line_18 = next(f for f in _property_schedule_e(schedule_e, prop).fields if f.field_id == "line_18")
        assert [(s.source_type, s.source_id, s.amount) for s in line_18.sources] == [
            ("tax_form_instance", form_4562_id, ANNUAL_DEPRECIATION),
        ]

    @pytest.mark.asyncio
    async def test_a_rental_with_no_transactions_still_shows_its_depreciation(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = _rental(test_org, test_user)
        db.add(prop)
        await db.flush()
        tax_return = await _new_return(db, test_org)

        await _recompute(db, test_org, tax_return)

        schedule_e = await _instances(db, tax_return, "schedule_e")
        lines = _values(_property_schedule_e(schedule_e, prop))
        assert lines["line_18"] == ANNUAL_DEPRECIATION
        assert lines["line_21"] == -ANNUAL_DEPRECIATION
        assert _line_26(schedule_e) == -ANNUAL_DEPRECIATION

    @pytest.mark.asyncio
    async def test_recompute_twice_does_not_double_the_depreciation(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_rental(db, test_org, test_user)
        tax_return = await _new_return(db, test_org)

        await _recompute(db, test_org, tax_return)
        await _recompute(db, test_org, tax_return)

        schedule_e = await _instances(db, tax_return, "schedule_e")
        assert _values(_property_schedule_e(schedule_e, prop))["line_18"] == ANNUAL_DEPRECIATION


class TestOnlyRentalsAreDepreciated:
    @pytest.mark.asyncio
    async def test_a_primary_residence_gets_no_form_4562(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        db.add(_rental(
            test_org, test_user,
            classification=PropertyClassification.PRIMARY_RESIDENCE, type=None,
        ))
        await db.flush()
        tax_return = await _new_return(db, test_org)

        results = await _recompute(db, test_org, tax_return)

        assert await _instances(db, tax_return, "form_4562") == []
        assert await _instances(db, tax_return, "schedule_e") == []
        assert not [r for r in results if "Form 4562" in r.message]

    @pytest.mark.asyncio
    async def test_reclassifying_a_rental_as_home_takes_its_depreciation_back_off(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_rental(db, test_org, test_user)
        tax_return = await _new_return(db, test_org)
        await _recompute(db, test_org, tax_return)

        prop.classification = PropertyClassification.PRIMARY_RESIDENCE
        prop.type = None
        await db.commit()
        await _recompute(db, test_org, tax_return)

        form_4562 = await _instances(db, tax_return, "form_4562")
        assert _values(form_4562[0])["depreciation_amount"] == Decimal("0")


class TestDepreciationWarning:
    @pytest.mark.asyncio
    async def test_no_warning_once_depreciation_is_computed(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed_rental(db, test_org, test_user)
        tax_return = await _new_return(db, test_org)

        results = await _recompute(db, test_org, tax_return)

        assert _no_depreciation_warnings(results) == []

    @pytest.mark.asyncio
    async def test_warns_when_the_rental_has_nothing_to_depreciate_from(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed_rental(db, test_org, test_user, date_placed_in_service=None)
        tax_return = await _new_return(db, test_org)

        results = await _recompute(db, test_org, tax_return)

        assert len(_no_depreciation_warnings(results)) == 1


class TestOverrides:
    @pytest.mark.asyncio
    async def test_an_overridden_line_18_is_kept_and_totals_follow_it(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_rental(db, test_org, test_user)
        tax_return = await _new_return(db, test_org)
        await _recompute(db, test_org, tax_return)

        schedule_e = await _instances(db, tax_return, "schedule_e")
        line_18 = next(f for f in _property_schedule_e(schedule_e, prop).fields if f.field_id == "line_18")
        line_18.value_numeric = Decimal("8000.00")
        line_18.is_overridden = True
        await db.commit()

        results = await _recompute(db, test_org, tax_return)

        schedule_e = await _instances(db, tax_return, "schedule_e")
        lines = _values(_property_schedule_e(schedule_e, prop))
        assert lines["line_18"] == Decimal("8000.00")
        assert lines["line_20"] == CLEANING + Decimal("8000.00")
        assert lines["line_21"] == RENT - CLEANING - Decimal("8000.00")
        assert _line_26(schedule_e) == RENT - CLEANING - Decimal("8000.00")
        assert not [r for r in results if "Schedule E math error" in r.message]

    @pytest.mark.asyncio
    async def test_an_overridden_form_4562_amount_reaches_line_18(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_rental(db, test_org, test_user)
        tax_return = await _new_return(db, test_org)
        await _recompute(db, test_org, tax_return)

        form_4562 = (await _instances(db, tax_return, "form_4562"))[0]
        amount = next(f for f in form_4562.fields if f.field_id == "depreciation_amount")
        amount.value_numeric = Decimal("9000.00")
        amount.is_overridden = True
        await db.commit()

        await _recompute(db, test_org, tax_return)

        schedule_e = await _instances(db, tax_return, "schedule_e")
        assert _values(_property_schedule_e(schedule_e, prop))["line_18"] == Decimal("9000.00")


async def _override(
    db: AsyncSession, tax_return: TaxReturn, form_name: str, prop: Property, field_id: str, value: Decimal,
) -> None:
    instance = _property_schedule_e(await _instances(db, tax_return, form_name), prop)
    field = next(f for f in instance.fields if f.field_id == field_id)
    field.value_numeric = value
    field.is_overridden = True
    await db.commit()


class TestStaleForm4562:
    @pytest.mark.asyncio
    async def test_a_deactivated_rental_stops_depreciating_and_its_form_is_cleared(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_rental(db, test_org, test_user)
        tax_return = await _new_return(db, test_org)
        await _recompute(db, test_org, tax_return)

        prop.is_active = False
        await db.commit()
        await _recompute(db, test_org, tax_return)

        form_4562 = _values((await _instances(db, tax_return, "form_4562"))[0])
        assert form_4562 == {"depreciation_amount": Decimal("0"), "depreciable_basis": None, "useful_life_years": None}
        schedule_e = await _instances(db, tax_return, "schedule_e")
        assert _values(_property_schedule_e(schedule_e, prop))["line_18"] == Decimal("0")

    @pytest.mark.asyncio
    async def test_an_overridden_amount_still_reaches_line_18_once_the_property_stops_computing(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_rental(db, test_org, test_user)
        tax_return = await _new_return(db, test_org)
        await _recompute(db, test_org, tax_return)
        await _override(db, tax_return, "form_4562", prop, "depreciation_amount", Decimal("9000.00"))

        prop.land_value = prop.purchase_price
        await db.commit()
        await _recompute(db, test_org, tax_return)

        form_4562 = _values((await _instances(db, tax_return, "form_4562"))[0])
        assert form_4562["depreciation_amount"] == Decimal("9000.00")
        assert form_4562["depreciable_basis"] is None
        schedule_e = await _instances(db, tax_return, "schedule_e")
        assert _values(_property_schedule_e(schedule_e, prop))["line_18"] == Decimal("9000.00")
        assert _line_26(schedule_e) == RENT - CLEANING - Decimal("9000.00")


class TestDepreciationTransactions:
    async def _seed_with_depreciation_txn(
        self, db: AsyncSession, org: Organization, user: User, **kwargs,
    ) -> Property:
        prop = await _seed_rental(db, org, user, **kwargs)
        db.add(_txn(
            org, user, prop, amount=Decimal("3000.00"), transaction_type="expense",
            category="other_expense", schedule_e_line="line_18_depreciation",
        ))
        await db.flush()
        return prop

    @pytest.mark.asyncio
    async def test_a_form_4562_replaces_transactions_tagged_as_depreciation(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await self._seed_with_depreciation_txn(db, test_org, test_user)
        tax_return = await _new_return(db, test_org)

        await _recompute(db, test_org, tax_return)

        schedule_e = await _instances(db, tax_return, "schedule_e")
        line_18 = next(f for f in _property_schedule_e(schedule_e, prop).fields if f.field_id == "line_18")
        assert line_18.value_numeric == ANNUAL_DEPRECIATION
        assert [s.source_type for s in line_18.sources] == ["tax_form_instance"]

    @pytest.mark.asyncio
    async def test_without_a_form_4562_the_tagged_transactions_still_count(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await self._seed_with_depreciation_txn(db, test_org, test_user, date_placed_in_service=None)
        tax_return = await _new_return(db, test_org)

        await _recompute(db, test_org, tax_return)

        schedule_e = await _instances(db, tax_return, "schedule_e")
        assert _values(_property_schedule_e(schedule_e, prop))["line_18"] == Decimal("3000.00")


class TestTotals:
    @pytest.mark.asyncio
    async def test_a_reclassified_property_with_an_override_stays_out_of_line_26(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed_rental(db, test_org, test_user)
        home = await _seed_rental(db, test_org, test_user, name="Elm", address="1 Elm St")
        tax_return = await _new_return(db, test_org)
        await _recompute(db, test_org, tax_return)
        await _override(db, tax_return, "schedule_e", home, "line_18", Decimal("8000.00"))

        home.classification = PropertyClassification.PRIMARY_RESIDENCE
        home.type = None
        await db.commit()
        await _recompute(db, test_org, tax_return)

        schedule_e = await _instances(db, tax_return, "schedule_e")
        assert _line_26(schedule_e) == RENT - CLEANING - ANNUAL_DEPRECIATION

    @pytest.mark.asyncio
    async def test_schedule_1_follows_line_26_down_to_zero(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_rental(db, test_org, test_user, date_placed_in_service=None)
        tax_return = await _new_return(db, test_org)
        await _recompute(db, test_org, tax_return)

        db.add(_txn(
            test_org, test_user, prop, amount=RENT - CLEANING, transaction_type="expense",
            category="other_expense", schedule_e_line="line_19_other",
        ))
        await db.commit()
        await _recompute(db, test_org, tax_return)

        assert _line_26(await _instances(db, tax_return, "schedule_e")) == Decimal("0")
        assert _values((await _instances(db, tax_return, "schedule_1"))[0])["line_5"] == Decimal("0")
        assert _values((await _instances(db, tax_return, "1040"))[0])["line_8"] == Decimal("0")
