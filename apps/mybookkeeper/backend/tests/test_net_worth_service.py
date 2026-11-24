"""Net worth and its snapshots against a real (SQLite) database.

Each service opens its own session through ``unit_of_work``; each test
patches it to the test session so commits behave as they do in production.

Pinned: one snapshot per source per day (same source twice in a day updates,
another day adds, a property gets one per person); account writes and a new
property value record today's snapshot; history's last point is today's
total; a deleted account's history drops out; the daily run covers every
owner and one failure skips no one else.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.mortgage.mortgage import Mortgage
from app.models.net_worth.balance_snapshot import BalanceSnapshot
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.user.user import User
from app.schemas.financial_accounts.financial_account_create_request import (
    FinancialAccountCreateRequest,
)
from app.services.financial_accounts import financial_account_service
from app.services.net_worth import net_worth_service
from app.services.properties import property_value_service
from app.services.properties.property_not_found_error import PropertyNotFoundError

pytestmark = pytest.mark.asyncio

_TODAY = _dt.date.today()


def _days_ago(n: int) -> _dt.date:
    return _TODAY - _dt.timedelta(days=n)


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with (
        patch.object(net_worth_service, "unit_of_work", _uow),
        patch.object(financial_account_service, "unit_of_work", _uow),
        patch.object(property_value_service, "unit_of_work", _uow),
    ):
        yield


async def _snapshots(db: AsyncSession) -> list[BalanceSnapshot]:
    result = await db.execute(select(BalanceSnapshot).order_by(BalanceSnapshot.snapshot_date))
    return list(result.scalars().all())


async def _account(db: AsyncSession, org: Organization, user: User, **overrides: object) -> FinancialAccount:
    values: dict[str, object] = {
        "id": uuid.uuid4(), "organization_id": org.id, "user_id": user.id,
        "name": "Chase Checking", "account_type": "checking",
        "current_balance_cents": 1_000_00, "balance_as_of": _TODAY,
    }
    values.update(overrides)
    account = FinancialAccount(**values)
    db.add(account)
    await db.commit()
    return account


async def _property(db: AsyncSession, org: Organization, user: User, **overrides: object) -> Property:
    values: dict[str, object] = {
        "id": uuid.uuid4(), "organization_id": org.id, "user_id": user.id,
        "name": "6734 Peerless", "address": "6734 Peerless St",
    }
    values.update(overrides)
    prop = Property(**values)
    db.add(prop)
    await db.commit()
    return prop


async def _record(db: AsyncSession, org: Organization, user_id: uuid.UUID, day: _dt.date = _TODAY) -> None:
    await net_worth_service.record_today(db, organization_id=org.id, user_id=user_id, today=day)
    await db.commit()


class TestOneSnapshotPerSourcePerDay:
    async def test_same_source_same_day_updates_the_one_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        account = await _account(db, test_org, test_user)
        await _record(db, test_org, test_user.id)
        account.current_balance_cents = 2_000_00
        await db.commit()
        await _record(db, test_org, test_user.id)

        [row] = await _snapshots(db)
        assert (row.financial_account_id, row.balance_cents) == (account.id, 2_000_00)

    async def test_same_source_another_day_adds_a_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _account(db, test_org, test_user)
        await _record(db, test_org, test_user.id, _days_ago(1))
        await _record(db, test_org, test_user.id)
        assert [r.snapshot_date for r in await _snapshots(db)] == [_days_ago(1), _TODAY]

    async def test_a_workspace_property_gets_one_row_per_person(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _property(db, test_org, test_user, estimated_value_cents=400_000_00, estimated_value_as_of=_TODAY)
        teammate = uuid.uuid4()
        await _record(db, test_org, test_user.id)
        await _record(db, test_org, teammate)
        await _record(db, test_org, teammate)
        rows = await _snapshots(db)
        assert sorted(str(r.user_id) for r in rows) == sorted([str(test_user.id), str(teammate)])

    async def test_sources_without_a_value_are_not_snapshotted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _account(db, test_org, test_user, current_balance_cents=None, balance_as_of=None)
        await _property(db, test_org, test_user)
        await _record(db, test_org, test_user.id)
        assert await _snapshots(db) == []


class TestWritesRecordToday:
    async def test_creating_and_editing_an_account_records_todays_snapshot(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _session(db):
            created = await financial_account_service.create_account(
                user_id=test_user.id, organization_id=test_org.id,
                payload=FinancialAccountCreateRequest(
                    name="Savings", account_type="savings",
                    current_balance_cents=500_00, balance_as_of=_TODAY,
                ),
            )
            await financial_account_service.update_account(
                account_id=created.id, user_id=test_user.id, organization_id=test_org.id,
                fields={"current_balance_cents": 750_00, "balance_as_of": _TODAY},
            )
        [row] = await _snapshots(db)
        assert (row.financial_account_id, row.snapshot_date, row.balance_cents) == (created.id, _TODAY, 750_00)

    async def test_a_property_value_counts_and_is_snapshotted_and_clearing_asks_again(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _property(db, test_org, test_user)
        with _session(db):
            saved = await property_value_service.set_estimated_value(
                property_id=prop.id, organization_id=test_org.id, user_id=test_user.id,
                value_cents=350_000_00, today=_TODAY,
            )
            worth = await net_worth_service.get_net_worth(
                organization_id=test_org.id, user_id=test_user.id, today=_TODAY,
            )
            assert saved.estimated_value_as_of == _TODAY
            assert worth.assets_cents == 350_000_00
            assert [r.property_id for r in await _snapshots(db)] == [prop.id]

            cleared = await property_value_service.set_estimated_value(
                property_id=prop.id, organization_id=test_org.id, user_id=test_user.id,
                value_cents=None, today=_TODAY,
            )
            worth = await net_worth_service.get_net_worth(
                organization_id=test_org.id, user_id=test_user.id, today=_TODAY,
            )
        assert cleared.estimated_value_as_of is None
        [group] = worth.groups
        assert group.lines[0].amount_cents is None
        assert worth.assets_cents == 0

    async def test_another_workspaces_property_is_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _property(db, test_org, test_user)
        with _session(db), pytest.raises(PropertyNotFoundError):
            await property_value_service.set_estimated_value(
                property_id=prop.id, organization_id=uuid.uuid4(), user_id=test_user.id,
                value_cents=1, today=_TODAY,
            )


class TestHistory:
    async def test_the_last_point_is_todays_total_and_missed_days_carry_forward(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        account = await _account(db, test_org, test_user, current_balance_cents=900_00)
        db.add(BalanceSnapshot(
            organization_id=test_org.id, user_id=test_user.id, snapshot_date=_days_ago(3),
            financial_account_id=account.id, balance_cents=100_00,
        ))
        await db.commit()
        with _session(db):
            history = await net_worth_service.get_history(
                organization_id=test_org.id, user_id=test_user.id, range_key="1m", today=_TODAY,
            )
            worth = await net_worth_service.get_net_worth(
                organization_id=test_org.id, user_id=test_user.id, today=_TODAY,
            )
        assert [p.day for p in history.points] == [_days_ago(3), _days_ago(2), _days_ago(1), _TODAY]
        assert [p.net_cents for p in history.points] == [100_00, 100_00, 100_00, 900_00]
        assert history.points[-1].net_cents == worth.net_cents

    async def test_the_range_starts_at_its_window_and_carries_the_older_value_in(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        account = await _account(db, test_org, test_user)
        db.add(BalanceSnapshot(
            organization_id=test_org.id, user_id=test_user.id, snapshot_date=_days_ago(200),
            financial_account_id=account.id, balance_cents=42,
        ))
        await db.commit()
        with _session(db):
            history = await net_worth_service.get_history(
                organization_id=test_org.id, user_id=test_user.id, range_key="1m", today=_TODAY,
            )
        assert history.points[0].day == _days_ago(30)
        assert history.points[0].net_cents == 42
        assert len(history.points) == 31

    async def test_a_deleted_accounts_history_drops_out(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        keep = await _account(db, test_org, test_user, current_balance_cents=10)
        gone = await _account(
            db, test_org, test_user, deleted_at=_dt.datetime.now(_dt.timezone.utc),
        )
        for account, cents in ((keep, 10), (gone, 5_000)):
            db.add(BalanceSnapshot(
                organization_id=test_org.id, user_id=test_user.id, snapshot_date=_days_ago(1),
                financial_account_id=account.id, balance_cents=cents,
            ))
        await db.commit()
        with _session(db):
            history = await net_worth_service.get_history(
                organization_id=test_org.id, user_id=test_user.id, range_key="all", today=_TODAY,
            )
        assert [p.net_cents for p in history.points] == [10, 10]

    async def test_an_unlinked_mortgage_is_a_liability_in_today_and_history(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _property(db, test_org, test_user)
        db.add(Mortgage(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            rate_type="fixed", current_balance_cents=200_000_00, statement_date=_days_ago(60),
        ))
        await db.commit()
        await _record(db, test_org, test_user.id, _days_ago(1))
        with _session(db):
            worth = await net_worth_service.get_net_worth(
                organization_id=test_org.id, user_id=test_user.id, today=_TODAY,
            )
            history = await net_worth_service.get_history(
                organization_id=test_org.id, user_id=test_user.id, range_key="1m", today=_TODAY,
            )
        assert worth.liabilities_cents == 200_000_00
        loan_line = worth.groups[-1].lines[0]
        assert loan_line.is_stale is True
        assert [p.liabilities_cents for p in history.points] == [200_000_00, 200_000_00]

    async def test_nothing_to_count_is_no_points(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _session(db):
            history = await net_worth_service.get_history(
                organization_id=test_org.id, user_id=test_user.id, range_key="all", today=_TODAY,
            )
        assert history.points == []

    async def test_an_unknown_range_is_refused(self, test_user: User, test_org: Organization) -> None:
        with pytest.raises(net_worth_service.InvalidNetWorthRangeError):
            await net_worth_service.get_history(
                organization_id=test_org.id, user_id=test_user.id, range_key="5y", today=_TODAY,
            )


class TestDailyRun:
    async def test_every_owner_is_recorded_and_one_failure_skips_no_one(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _account(db, test_org, test_user)
        property_owner = uuid.uuid4()
        await _property(
            db, test_org, test_user, user_id=property_owner,
            estimated_value_cents=1, estimated_value_as_of=_TODAY,
        )
        real_record = net_worth_service.record_today
        calls: list[uuid.UUID] = []

        async def _flaky(session: AsyncSession, *, organization_id: uuid.UUID, user_id: uuid.UUID, today: _dt.date) -> None:
            calls.append(user_id)
            if len(calls) == 1:
                raise RuntimeError("db blip")
            await real_record(session, organization_id=organization_id, user_id=user_id, today=today)

        with _session(db), patch.object(net_worth_service, "record_today", _flaky):
            recorded = await net_worth_service.record_all_today(today=_TODAY)

        assert sorted(map(str, calls)) == sorted([str(test_user.id), str(property_owner)])
        assert recorded == 1
