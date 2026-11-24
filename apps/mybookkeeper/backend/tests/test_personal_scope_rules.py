"""Personal spending is tracked, never taxed.

Every tax report reads ``tax_relevant`` rows, so a personal row stays off them
only if it can never be tax-relevant. Pinned here:

* the pure rules: a personal row has its tax fields forced off, and only a
  personal row keeps a spending category;
* create, update and the bulk capital-improvement toggle apply those rules,
  and a spending category must belong to the caller's workspace;
* retroactive rule learning never rewrites personal rows;
* the database refuses a personal row with tax fields.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.transactions.spending_category import SpendingCategory
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.transactions import transaction_list_repo
from app.services.transactions import transaction_service
from app.services.transactions.foreign_reference_error import ForeignReferenceError
from app.services.transactions.scope_rules import scope_overrides

_DATE = _dt.date(2026, 10, 5)


class TestScopeRules:
    def test_a_personal_row_has_its_tax_fields_forced_off(self) -> None:
        assert scope_overrides(
            transaction_scope="personal", spending_category_id=uuid.uuid4(),
        ) == {
            "tax_relevant": False,
            "schedule_e_line": None,
            "is_capital_improvement": False,
            "placed_in_service_date": None,
        }

    @pytest.mark.parametrize("scope", ["rental", "business"])
    def test_a_non_personal_row_drops_its_spending_category(self, scope: str) -> None:
        assert scope_overrides(
            transaction_scope=scope, spending_category_id=uuid.uuid4(),
        ) == {"spending_category_id": None}

    def test_a_plain_rental_row_is_left_alone(self) -> None:
        assert scope_overrides(transaction_scope="rental", spending_category_id=None) == {}


@contextmanager
def _service_session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(transaction_service, "unit_of_work", _uow), patch.object(
        transaction_service, "AsyncSessionLocal", _uow,
    ):
        yield


def _ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(organization_id=org.id, user_id=user.id, org_role="owner")


def _manual(**fields: object) -> dict[str, object]:
    data: dict[str, object] = {
        "transaction_date": _DATE,
        "vendor": "H-E-B",
        "amount": Decimal("82.40"),
        "transaction_type": "expense",
        "category": "maintenance",
        "tax_relevant": True,
    }
    data.update(fields)
    return data


async def _category(db: AsyncSession, org_id: uuid.UUID, name: str = "Groceries") -> SpendingCategory:
    category = SpendingCategory(organization_id=org_id, name=name)
    db.add(category)
    await db.commit()
    return category


class TestThroughTheService:
    @pytest.mark.asyncio
    async def test_a_personal_expense_is_saved_with_no_tax_effect(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        groceries = await _category(db, test_org.id)
        with _service_session(db):
            txn = await transaction_service.create_manual_transaction(
                _ctx(test_org, test_user),
                _manual(
                    transaction_scope="personal",
                    spending_category_id=groceries.id,
                    is_capital_improvement=True,
                ),
            )
        assert txn.transaction_scope == "personal"
        assert txn.spending_category_id == groceries.id
        assert txn.tax_relevant is False
        assert txn.schedule_e_line is None
        assert txn.is_capital_improvement is False

    @pytest.mark.asyncio
    async def test_rescoping_a_rental_expense_as_personal_clears_its_tax_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _service_session(db):
            txn = await transaction_service.create_manual_transaction(
                _ctx(test_org, test_user), _manual(),
            )
            assert txn.schedule_e_line is not None
            result = await transaction_service.update_transaction(
                _ctx(test_org, test_user), txn.id,
                {"transaction_scope": "personal", "category": "utilities"},
            )
        assert result is not None
        updated, _ = result
        assert updated.tax_relevant is False
        assert updated.schedule_e_line is None

    @pytest.mark.asyncio
    async def test_a_rental_row_drops_a_spending_category(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        groceries = await _category(db, test_org.id)
        with _service_session(db):
            txn = await transaction_service.create_manual_transaction(
                _ctx(test_org, test_user), _manual(spending_category_id=groceries.id),
            )
        assert txn.spending_category_id is None
        assert txn.tax_relevant is True

    @pytest.mark.asyncio
    async def test_another_workspaces_spending_category_is_refused(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        other = Organization(id=uuid.uuid4(), name="Other workspace", created_by=test_user.id)
        db.add(other)
        await db.commit()
        theirs = await _category(db, other.id)
        with _service_session(db), pytest.raises(ForeignReferenceError, match="spending_category_id"):
            await transaction_service.create_manual_transaction(
                _ctx(test_org, test_user),
                _manual(transaction_scope="personal", spending_category_id=theirs.id),
            )

    @pytest.mark.asyncio
    async def test_bulk_capital_improvement_skips_personal_expenses(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _service_session(db):
            ctx = _ctx(test_org, test_user)
            rental = await transaction_service.create_manual_transaction(ctx, _manual())
            personal = await transaction_service.create_manual_transaction(
                ctx, _manual(transaction_scope="personal"),
            )
            result = await transaction_service.bulk_set_capital_improvement(
                ctx, [rental.id, personal.id], True,
            )
        assert result == {"updated": 1, "skipped": 1}
        await db.refresh(personal)
        assert personal.is_capital_improvement is False


def _row(org: Organization, user: User, **fields: object) -> Transaction:
    base: dict[str, object] = {
        "organization_id": org.id,
        "user_id": user.id,
        "transaction_date": _DATE,
        "tax_year": _DATE.year,
        "amount": Decimal("40.00"),
        "transaction_type": "expense",
        "category": "other_expense",
        "status": "approved",
        "vendor": "Home Depot",
    }
    base.update(fields)
    return Transaction(**base)


class TestRetroactiveRulesSkipPersonalRows:
    @pytest.mark.asyncio
    async def test_a_correction_on_a_personal_row_teaches_no_rule(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        rental = _row(test_org, test_user)
        personal = _row(test_org, test_user, transaction_scope="personal")
        db.add_all([rental, personal])
        await db.commit()

        with _service_session(db):
            result = await transaction_service.update_transaction(
                _ctx(test_org, test_user), personal.id, {"category": "supplies"},
            )
        assert result is not None
        assert result[1] == 0
        await db.refresh(rental)
        assert rental.category == "other_expense"

    @pytest.mark.asyncio
    async def test_personal_rows_are_not_candidates(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        rental = _row(test_org, test_user)
        personal = _row(test_org, test_user, transaction_scope="personal")
        db.add_all([rental, personal])
        await db.commit()

        candidates = await transaction_list_repo.find_by_vendor_for_retroactive(
            db, test_org.id, uuid.uuid4(), categories={"other_expense"},
        )
        ids = {c.id for c in candidates}
        assert rental.id in ids
        assert personal.id not in ids


class TestDatabaseConstraints:
    @pytest.mark.asyncio
    async def test_a_personal_row_with_tax_fields_is_refused(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        db.add(_row(test_org, test_user, transaction_scope="personal", tax_relevant=True))
        with pytest.raises(IntegrityError, match="chk_txn_personal_not_tax"):
            await db.commit()
        await db.rollback()

    @pytest.mark.asyncio
    async def test_a_rental_row_with_a_spending_category_is_refused(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        groceries = await _category(db, test_org.id)
        db.add(_row(test_org, test_user, spending_category_id=groceries.id))
        with pytest.raises(IntegrityError, match="chk_txn_spending_category_personal"):
            await db.commit()
        await db.rollback()
