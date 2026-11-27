"""Savings repositories against a real (SQLite) database.

Pinned: spending counts only approved, live expenses (never transfers,
personal transfers or another workspace's), personal rows are labelled by
spending category; merchant rows leave out anything tied to a person; one
running run per person (a second start raises, another person may start);
stale runs close as interrupted; manual starts are counted per person;
the open list drops stale, expired, done and dismissed ideas and ranks by
savings; turning research on stamps ``enabled_at`` once.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.savings_enums import (
    IDEA_STATUS_DISMISSED,
    IDEA_STATUS_DONE,
    IDEA_STATUS_OPEN,
    RUN_ERROR_INTERRUPTED,
    RUN_STATUS_FAILED,
    RUN_STATUS_RUNNING,
    RUN_TRIGGER_MANUAL,
    RUN_TRIGGER_SCHEDULED,
)
from app.models.savings.savings_idea import SavingsIdea
from app.models.transactions.spending_category import SpendingCategory
from app.models.transactions.transaction import Transaction
from app.repositories.savings import (
    savings_idea_repo,
    savings_run_repo,
    savings_setting_repo,
    savings_spending_repo,
)
from app.repositories.savings.run_already_running_error import RunAlreadyRunningError

pytestmark = pytest.mark.asyncio

_DAY = _dt.date(2026, 6, 1)
_START = _dt.date(2025, 12, 1)
_END = _dt.date(2026, 11, 30)
_NOW = _dt.datetime(2026, 11, 27, 12, tzinfo=_dt.timezone.utc)


def _ids() -> dict[str, uuid.UUID]:
    return {"organization_id": uuid.uuid4(), "user_id": uuid.uuid4()}


async def _txn(db: AsyncSession, ids: dict[str, uuid.UUID], **fields: object) -> Transaction:
    values: dict[str, object] = {
        "id": uuid.uuid4(), **ids, "transaction_date": _DAY, "tax_year": 2026, "amount": Decimal("50"),
        "transaction_type": "expense", "category": "utilities", "status": "approved", "is_manual": True,
        "vendor": "Comcast",
    }
    values.update(fields)
    txn = Transaction(**values)
    db.add(txn)
    await db.flush()
    return txn


class TestSpending:
    async def test_only_counted_expenses_in_the_window(self, db: AsyncSession) -> None:
        ids = _ids()
        await _txn(db, ids, amount=Decimal("100"))
        await _txn(db, ids, amount=Decimal("7"), transaction_type="transfer", category="transfer")
        await _txn(db, ids, amount=Decimal("9"), status="personal_transfer", status_before_personal_transfer="approved")
        await _txn(db, ids, amount=Decimal("11"), status="pending")
        await _txn(db, ids, amount=Decimal("13"), transaction_type="income", category="rental_revenue")
        await _txn(db, ids, amount=Decimal("17"), transaction_date=_dt.date(2025, 1, 1))
        await _txn(db, ids, amount=Decimal("19"), deleted_at=_NOW)
        await _txn(db, _ids(), amount=Decimal("23"))
        rows = await savings_spending_repo.expense_totals_by_category(
            db, organization_id=ids["organization_id"], start=_START, end=_END,
        )
        assert rows == [("rental", "utilities", Decimal("100"), 1)]

    async def test_personal_rows_are_labelled_by_spending_category(self, db: AsyncSession) -> None:
        ids = _ids()
        groceries = SpendingCategory(id=uuid.uuid4(), organization_id=ids["organization_id"], name="Groceries")
        db.add(groceries)
        await db.flush()
        await _txn(db, ids, transaction_scope="personal", spending_category_id=groceries.id,
                   category="uncategorized", amount=Decimal("80"), tax_relevant=False)
        await _txn(db, ids, transaction_scope="personal", spending_category_id=groceries.id,
                   category="uncategorized", amount=Decimal("20"), tax_relevant=False)
        rows = await savings_spending_repo.expense_totals_by_category(
            db, organization_id=ids["organization_id"], start=_START, end=_END,
        )
        assert rows == [("personal", "Groceries", Decimal("100"), 2)]

    async def test_merchant_rows_skip_anything_tied_to_a_person(self, db: AsyncSession) -> None:
        ids = _ids()
        await _txn(db, ids, vendor="Netflix", normalized_vendor="netflix")
        await _txn(db, ids, vendor="Jane Tenant", payer_name="Jane Tenant")
        await _txn(db, ids, vendor="Unit 2 refund", applicant_id=uuid.uuid4())
        await _txn(db, ids, vendor=None)
        rows = await savings_spending_repo.merchant_charges(
            db, organization_id=ids["organization_id"], start=_START, end=_END,
        )
        assert rows == [("netflix", _DAY, Decimal("50"))]


class TestRuns:
    async def test_one_running_run_per_person(self, db: AsyncSession) -> None:
        ids = _ids()
        await savings_run_repo.start(db, **ids, trigger=RUN_TRIGGER_MANUAL, now=_NOW)
        with pytest.raises(RunAlreadyRunningError):
            await savings_run_repo.start(db, **ids, trigger=RUN_TRIGGER_SCHEDULED, now=_NOW)
        other = await savings_run_repo.start(
            db, organization_id=ids["organization_id"], user_id=uuid.uuid4(), trigger=RUN_TRIGGER_MANUAL, now=_NOW,
        )
        assert other.status == RUN_STATUS_RUNNING

    async def test_stale_runs_close_as_interrupted_and_free_the_slot(self, db: AsyncSession) -> None:
        ids = _ids()
        old = await savings_run_repo.start(db, **ids, trigger=RUN_TRIGGER_SCHEDULED, now=_NOW - _dt.timedelta(hours=2))
        closed = await savings_run_repo.close_stale(db, started_before=_NOW - _dt.timedelta(minutes=45), now=_NOW)
        assert closed == 1
        await db.refresh(old)
        assert (old.status, old.error_type) == (RUN_STATUS_FAILED, RUN_ERROR_INTERRUPTED)
        await savings_run_repo.start(db, **ids, trigger=RUN_TRIGGER_MANUAL, now=_NOW)

    async def test_manual_starts_count_only_this_persons_manual_runs(self, db: AsyncSession) -> None:
        ids = _ids()
        for hours_ago, trigger in ((30, RUN_TRIGGER_MANUAL), (5, RUN_TRIGGER_MANUAL), (3, RUN_TRIGGER_SCHEDULED)):
            run = await savings_run_repo.start(db, **ids, trigger=trigger, now=_NOW - _dt.timedelta(hours=hours_ago))
            run.status, run.finished_at = RUN_STATUS_FAILED, _NOW
            await db.flush()
        starts = await savings_run_repo.manual_starts_since(db, **ids, since=_NOW - _dt.timedelta(hours=24))
        assert len(starts) == 1
        latest = await savings_run_repo.get_latest(db, **ids)
        assert latest is not None and latest.trigger == RUN_TRIGGER_SCHEDULED


def _row(ids: dict[str, uuid.UUID], key: str, **fields: object) -> SavingsIdea:
    values: dict[str, object] = {
        **ids, "idea_key": key, "category": "subscription", "subject": key, "title": key,
        "savings_low_cents": 1000, "savings_high_cents": 2000, "effort": "low", "why_it_fits": "because",
        "status": IDEA_STATUS_OPEN, "first_found_at": _NOW, "last_confirmed_at": _NOW,
    }
    values.update(fields)
    return SavingsIdea(**values)


class TestIdeas:
    async def test_the_open_list_drops_stale_expired_and_decided_ideas(self, db: AsyncSession) -> None:
        ids = _ids()
        for idea in (
            _row(ids, "small"),
            _row(ids, "big", savings_high_cents=90_000),
            _row(ids, "stale", last_confirmed_at=_NOW - _dt.timedelta(days=8)),
            _row(ids, "expired", expires_on=_NOW.date() - _dt.timedelta(days=1)),
            _row(ids, "done", status=IDEA_STATUS_DONE),
            _row(ids, "dismissed", status=IDEA_STATUS_DISMISSED),
            _row({**ids, "user_id": uuid.uuid4()}, "someone-else"),
        ):
            await savings_idea_repo.add(db, idea)
        ideas = await savings_idea_repo.list_open(
            db, **ids, confirmed_since=_NOW - _dt.timedelta(days=7), today=_NOW.date(),
        )
        assert [idea.idea_key for idea in ideas] == ["big", "small"]

    async def test_lookup_by_key_sees_every_status(self, db: AsyncSession) -> None:
        ids = _ids()
        await savings_idea_repo.add(db, _row(ids, "a", status=IDEA_STATUS_DISMISSED))
        found = await savings_idea_repo.get_by_keys(db, **ids, keys=["a", "b"])
        assert list(found) == ["a"]
        assert await savings_idea_repo.get_by_keys(db, **ids, keys=[]) == {}


class TestSettings:
    async def test_turning_on_stamps_enabled_at_once(self, db: AsyncSession) -> None:
        ids = _ids()
        assert await savings_setting_repo.get(db, **ids) is None
        setting = await savings_setting_repo.set_enabled(db, **ids, enabled=True, now=_NOW)
        assert setting.enabled and setting.enabled_at == _NOW
        await savings_setting_repo.set_enabled(db, **ids, enabled=True, now=_NOW + _dt.timedelta(days=1))
        assert setting.enabled_at == _NOW
        await savings_setting_repo.set_enabled(db, **ids, enabled=False, now=_NOW)
        assert [s.user_id for s in await savings_setting_repo.list_enabled(db)] == []
