"""Service-level tests for the rent ledger.

Covers charge generation (including idempotency, which the unique index alone
would only enforce by raising) and the assembled ledger response, end to end
against the in-memory database.

``unit_of_work()`` is patched with ``_fake_uow(db)`` so the service writes into
the test session, matching the pattern in ``test_applicant_contract_service``.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.rent.rent_charge import RentCharge
from app.models.transactions.transaction import Transaction
from app.services.rent import rent_ledger_service, rent_schedule_service

ORG = uuid.uuid4()
USER = uuid.uuid4()


def _make_fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield session
    return _fake_uow


def _patch_uow(session: AsyncSession):
    """Patch ``unit_of_work`` in both rent service modules at once."""
    fake = _make_fake_uow(session)
    return (
        patch("app.services.rent.rent_ledger_service.unit_of_work", fake),
        patch("app.services.rent.rent_schedule_service.unit_of_work", fake),
    )


async def _make_tenant(session: AsyncSession) -> uuid.UUID:
    applicant = Applicant(
        id=uuid.uuid4(),
        organization_id=ORG,
        user_id=USER,
        stage="lease_signed",
    )
    session.add(applicant)
    await session.flush()
    return applicant.id


async def _make_payment(
    session: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    on: _dt.date,
    amount: str,
    category: str = "rental_revenue",
    status: str = "approved",
) -> uuid.UUID:
    txn = Transaction(
        id=uuid.uuid4(),
        organization_id=ORG,
        user_id=USER,
        applicant_id=applicant_id,
        transaction_date=on,
        tax_year=on.year,
        amount=Decimal(amount),
        transaction_type="income",
        category=category,
        status=status,
        payer_name="Sonu",
    )
    session.add(txn)
    await session.flush()
    return txn.id


async def _create_monthly_schedule(
    db: AsyncSession,
    applicant_id: uuid.UUID,
    *,
    amount: str = "1500.00",
    start: _dt.date = _dt.date(2026, 8, 1),
    cadence: str = "monthly",
):
    ledger_patch, schedule_patch = _patch_uow(db)
    with ledger_patch, schedule_patch:
        return await rent_schedule_service.create_schedule(
            organization_id=ORG,
            user_id=USER,
            applicant_id=applicant_id,
            amount=Decimal(amount),
            cadence=cadence,
            start_date=start,
        )


class TestChargeGeneration:
    @pytest.mark.asyncio
    async def test_creating_a_schedule_materializes_begun_periods(
        self, db: AsyncSession,
    ) -> None:
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(
            db, applicant_id, start=_dt.date(2026, 6, 1),
        )

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            await rent_ledger_service.ensure_charges_generated(
                db, organization_id=ORG, applicant_id=applicant_id,
                through=_dt.date(2026, 8, 15),
            )

        rows = (
            await db.execute(
                select(RentCharge)
                .where(RentCharge.applicant_id == applicant_id)
                .order_by(RentCharge.period_start),
            )
        ).scalars().all()

        assert [r.period_start for r in rows] == [
            _dt.date(2026, 6, 1), _dt.date(2026, 7, 1), _dt.date(2026, 8, 1),
        ]
        assert all(r.amount == Decimal("1500.00") for r in rows)
        assert all(r.charge_type == "rent" for r in rows)

    @pytest.mark.asyncio
    async def test_generation_is_idempotent(self, db: AsyncSession) -> None:
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(db, applicant_id, start=_dt.date(2026, 6, 1))

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            first = await rent_ledger_service.ensure_charges_generated(
                db, organization_id=ORG, applicant_id=applicant_id,
                through=_dt.date(2026, 8, 15),
            )
            second = await rent_ledger_service.ensure_charges_generated(
                db, organization_id=ORG, applicant_id=applicant_id,
                through=_dt.date(2026, 8, 15),
            )

        # The first call may find rows already made at create time; the second
        # must add nothing at all.
        assert second == 0
        count = len(
            (
                await db.execute(
                    select(RentCharge).where(RentCharge.applicant_id == applicant_id),
                )
            ).scalars().all(),
        )
        assert count == 3
        assert first >= 0

    @pytest.mark.asyncio
    async def test_end_date_truncates_and_prorates_the_final_period(
        self, db: AsyncSession,
    ) -> None:
        applicant_id = await _make_tenant(db)
        schedule = await _create_monthly_schedule(
            db, applicant_id, start=_dt.date(2026, 6, 1),
        )

        ledger_patch, schedule_patch = _patch_uow(db)
        with ledger_patch, schedule_patch:
            await rent_schedule_service.update_schedule(
                organization_id=ORG,
                user_id=USER,
                schedule_id=schedule.id,
                end_date=_dt.date(2026, 8, 15),
                fields_set={"end_date"},
            )
            await rent_ledger_service.ensure_charges_generated(
                db, organization_id=ORG, applicant_id=applicant_id,
                through=_dt.date(2026, 12, 31),
            )

        rows = (
            await db.execute(
                select(RentCharge)
                .where(RentCharge.applicant_id == applicant_id)
                .order_by(RentCharge.period_start),
            )
        ).scalars().all()

        assert len(rows) == 3
        assert rows[-1].period_end == _dt.date(2026, 8, 15)
        # 15 of August's 31 days.
        assert rows[-1].amount == Decimal("725.81")


    @pytest.mark.asyncio
    async def test_mid_month_move_in_prorates_only_the_first_period(
        self, db: AsyncSession,
    ) -> None:
        """A tenant who moves in Aug 15 owes 17 of August's 31 days, then full months."""
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(
            db, applicant_id, start=_dt.date(2026, 8, 15),
        )

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            await rent_ledger_service.ensure_charges_generated(
                db, organization_id=ORG, applicant_id=applicant_id,
                through=_dt.date(2026, 10, 5),
            )

        rows = (
            await db.execute(
                select(RentCharge)
                .where(RentCharge.applicant_id == applicant_id)
                .order_by(RentCharge.period_start),
            )
        ).scalars().all()

        assert [(r.period_start, r.period_end, r.amount) for r in rows] == [
            (_dt.date(2026, 8, 15), _dt.date(2026, 8, 31), Decimal("822.58")),
            (_dt.date(2026, 9, 1), _dt.date(2026, 9, 30), Decimal("1500.00")),
            (_dt.date(2026, 10, 1), _dt.date(2026, 10, 31), Decimal("1500.00")),
        ]

    @pytest.mark.asyncio
    async def test_mid_month_period_is_labelled_as_a_range_not_a_month(
        self, db: AsyncSession,
    ) -> None:
        """"August 2026" against $822.58 would read as a shortfall, not a part-month."""
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(
            db, applicant_id, start=_dt.date(2026, 8, 15),
        )

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            ledger = await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER,
                applicant_id=applicant_id, as_of=_dt.date(2026, 8, 20),
            )

        assert ledger.current_period is not None
        assert ledger.current_period.label == "Aug 15 – Aug 31, 2026"
        assert ledger.current_period.amount == Decimal("822.58")
        # The undivided amount rides along so the UI can explain the shortfall.
        august = next(c for c in ledger.charges if c.amount == Decimal("822.58"))
        assert august.full_amount == Decimal("1500.00")

    @pytest.mark.asyncio
    async def test_whole_periods_carry_no_full_amount(
        self, db: AsyncSession,
    ) -> None:
        """Only a prorated charge needs explaining; a full month speaks for itself."""
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(
            db, applicant_id, start=_dt.date(2026, 8, 1),
        )

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            ledger = await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER,
                applicant_id=applicant_id, as_of=_dt.date(2026, 8, 20),
            )

        assert [c.full_amount for c in ledger.charges] == [None]

    @pytest.mark.asyncio
    async def test_shortening_a_tenancy_retires_future_charges(
        self, db: AsyncSession,
    ) -> None:
        """Phantom future rent must not survive an end-date change."""
        applicant_id = await _make_tenant(db)
        schedule = await _create_monthly_schedule(
            db, applicant_id, start=_dt.date(2026, 6, 1),
        )

        ledger_patch, schedule_patch = _patch_uow(db)
        with ledger_patch:
            await rent_ledger_service.ensure_charges_generated(
                db, organization_id=ORG, applicant_id=applicant_id,
                through=_dt.date(2026, 8, 15),
            )

        live = (
            await db.execute(
                select(RentCharge).where(
                    RentCharge.applicant_id == applicant_id,
                    RentCharge.deleted_at.is_(None),
                ),
            )
        ).scalars().all()
        assert len(live) == 3

        with ledger_patch, schedule_patch:
            await rent_schedule_service.update_schedule(
                organization_id=ORG, user_id=USER, schedule_id=schedule.id,
                end_date=_dt.date(2026, 6, 30), fields_set={"end_date"},
            )

        live_after = (
            await db.execute(
                select(RentCharge).where(
                    RentCharge.applicant_id == applicant_id,
                    RentCharge.deleted_at.is_(None),
                ),
            )
        ).scalars().all()
        assert [c.period_start for c in live_after] == [_dt.date(2026, 6, 1)]


class TestLedger:
    @pytest.mark.asyncio
    async def test_weekly_payer_on_monthly_rent(self, db: AsyncSession) -> None:
        """The motivating case: $1,500/month settled in weekly $375 instalments."""
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(db, applicant_id, start=_dt.date(2026, 8, 1))
        for i in range(3):
            await _make_payment(
                db,
                applicant_id=applicant_id,
                on=_dt.date(2026, 8, 3) + _dt.timedelta(days=7 * i),
                amount="375.00",
            )

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            ledger = await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER,
                applicant_id=applicant_id, as_of=_dt.date(2026, 8, 20),
            )

        assert ledger.current_period is not None
        assert ledger.current_period.label == "August 2026"
        assert ledger.current_period.amount == Decimal("1500.00")
        assert ledger.current_period.allocated == Decimal("1125.00")
        assert ledger.current_period.remaining == Decimal("375.00")
        # Mid-month and on track — not delinquent.
        assert ledger.current_period.status == "partial"
        assert ledger.balance == Decimal("375.00")
        assert len(ledger.payments) == 3
        assert ledger.payments[0].applied_to == ["August 2026"]

    @pytest.mark.asyncio
    async def test_fourth_payment_closes_the_month(self, db: AsyncSession) -> None:
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(db, applicant_id, start=_dt.date(2026, 8, 1))
        for i in range(4):
            await _make_payment(
                db,
                applicant_id=applicant_id,
                on=_dt.date(2026, 8, 3) + _dt.timedelta(days=7 * i),
                amount="375.00",
            )

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            ledger = await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER,
                applicant_id=applicant_id, as_of=_dt.date(2026, 8, 25),
            )

        assert ledger.current_period is not None
        assert ledger.current_period.status == "paid"
        assert ledger.balance == Decimal("0.00")

    @pytest.mark.asyncio
    async def test_security_deposit_never_settles_rent(
        self, db: AsyncSession,
    ) -> None:
        """A deposit is held, not earned — it must not mark rent as paid."""
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(db, applicant_id, start=_dt.date(2026, 8, 1))
        await _make_payment(
            db, applicant_id=applicant_id, on=_dt.date(2026, 8, 2),
            amount="1500.00", category="security_deposit",
        )

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            ledger = await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER,
                applicant_id=applicant_id, as_of=_dt.date(2026, 8, 20),
            )

        assert ledger.payments == []
        assert ledger.balance == Decimal("1500.00")
        assert ledger.current_period is not None
        assert ledger.current_period.allocated == Decimal("0.00")

    @pytest.mark.asyncio
    async def test_duplicate_transactions_are_ignored(
        self, db: AsyncSession,
    ) -> None:
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(db, applicant_id, start=_dt.date(2026, 8, 1))
        await _make_payment(
            db, applicant_id=applicant_id, on=_dt.date(2026, 8, 2), amount="1500.00",
        )
        await _make_payment(
            db, applicant_id=applicant_id, on=_dt.date(2026, 8, 2),
            amount="1500.00", status="duplicate",
        )

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            ledger = await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER,
                applicant_id=applicant_id, as_of=_dt.date(2026, 8, 20),
            )

        assert len(ledger.payments) == 1
        assert ledger.balance == Decimal("0.00")

    @pytest.mark.asyncio
    async def test_paying_ahead_shows_as_credit(self, db: AsyncSession) -> None:
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(db, applicant_id, start=_dt.date(2026, 8, 1))
        await _make_payment(
            db, applicant_id=applicant_id, on=_dt.date(2026, 8, 2), amount="2000.00",
        )

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            ledger = await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER,
                applicant_id=applicant_id, as_of=_dt.date(2026, 8, 20),
            )

        assert ledger.unapplied_credit == Decimal("500.00")
        assert ledger.balance == Decimal("-500.00")

    @pytest.mark.asyncio
    async def test_weekly_cadence_labels_are_date_ranges(
        self, db: AsyncSession,
    ) -> None:
        """"August 2026" would be wrong for a 7-day period."""
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(
            db, applicant_id, amount="400.00",
            start=_dt.date(2026, 8, 3), cadence="weekly",
        )

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            ledger = await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER,
                applicant_id=applicant_id, as_of=_dt.date(2026, 8, 20),
            )

        assert ledger.current_period is not None
        assert ledger.current_period.label == "Aug 17 – Aug 23, 2026"
        assert ledger.current_period.amount == Decimal("400.00")

    @pytest.mark.asyncio
    async def test_unknown_tenant_raises(self, db: AsyncSession) -> None:
        ledger_patch, _ = _patch_uow(db)
        with ledger_patch, pytest.raises(rent_ledger_service.TenantNotFoundError):
            await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER, applicant_id=uuid.uuid4(),
            )

    @pytest.mark.asyncio
    async def test_tenant_with_no_schedule_returns_an_empty_ledger(
        self, db: AsyncSession,
    ) -> None:
        applicant_id = await _make_tenant(db)

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            ledger = await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER, applicant_id=applicant_id,
            )

        assert ledger.schedules == []
        assert ledger.charges == []
        assert ledger.current_period is None
        assert ledger.balance == Decimal("0.00")


class TestScheduleInvariants:
    @pytest.mark.asyncio
    async def test_overlapping_schedule_is_rejected(
        self, db: AsyncSession,
    ) -> None:
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(db, applicant_id, start=_dt.date(2026, 8, 1))

        with pytest.raises(rent_schedule_service.OverlappingScheduleError):
            await _create_monthly_schedule(
                db, applicant_id, amount="1600.00", start=_dt.date(2026, 9, 1),
            )

    @pytest.mark.asyncio
    async def test_rent_increase_via_a_second_non_overlapping_schedule(
        self, db: AsyncSession,
    ) -> None:
        """Close the old schedule, open a new one — history keeps the old rate."""
        applicant_id = await _make_tenant(db)
        first = await _create_monthly_schedule(
            db, applicant_id, start=_dt.date(2026, 6, 1),
        )

        ledger_patch, schedule_patch = _patch_uow(db)
        with ledger_patch, schedule_patch:
            await rent_schedule_service.update_schedule(
                organization_id=ORG, user_id=USER, schedule_id=first.id,
                end_date=_dt.date(2026, 7, 31), fields_set={"end_date"},
            )

        await _create_monthly_schedule(
            db, applicant_id, amount="1600.00", start=_dt.date(2026, 8, 1),
        )

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            ledger = await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER,
                applicant_id=applicant_id, as_of=_dt.date(2026, 8, 20),
            )

        by_start = {c.period_start: c.amount for c in ledger.charges}
        assert by_start[_dt.date(2026, 6, 1)] == Decimal("1500.00")
        assert by_start[_dt.date(2026, 7, 1)] == Decimal("1500.00")
        assert by_start[_dt.date(2026, 8, 1)] == Decimal("1600.00")

    @pytest.mark.asyncio
    async def test_waived_charge_stops_counting(self, db: AsyncSession) -> None:
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(db, applicant_id, start=_dt.date(2026, 8, 1))

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            ledger = await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER,
                applicant_id=applicant_id, as_of=_dt.date(2026, 8, 20),
            )
        charge_id = ledger.charges[0].id

        _, schedule_patch = _patch_uow(db)
        with schedule_patch:
            await rent_schedule_service.waive_charge(
                organization_id=ORG, charge_id=charge_id, reason="comped month",
            )

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            after = await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER,
                applicant_id=applicant_id, as_of=_dt.date(2026, 8, 20),
            )

        assert after.charges[0].status == "waived"
        assert after.total_charged == Decimal("0.00")
        assert after.balance == Decimal("0.00")

    @pytest.mark.asyncio
    async def test_one_off_charge_adds_to_the_balance(
        self, db: AsyncSession,
    ) -> None:
        applicant_id = await _make_tenant(db)
        await _create_monthly_schedule(db, applicant_id, start=_dt.date(2026, 8, 1))

        _, schedule_patch = _patch_uow(db)
        with schedule_patch:
            await rent_schedule_service.add_charge(
                organization_id=ORG, user_id=USER, applicant_id=applicant_id,
                amount=Decimal("75.00"), due_date=_dt.date(2026, 8, 6),
                charge_type="late_fee", description="August late fee",
            )

        ledger_patch, _ = _patch_uow(db)
        with ledger_patch:
            ledger = await rent_ledger_service.get_ledger(
                organization_id=ORG, user_id=USER,
                applicant_id=applicant_id, as_of=_dt.date(2026, 8, 20),
            )

        assert ledger.total_charged == Decimal("1575.00")
        assert ledger.balance == Decimal("1575.00")
        # A late fee is not "this month's rent".
        assert ledger.current_period is not None
        assert ledger.current_period.amount == Decimal("1500.00")
