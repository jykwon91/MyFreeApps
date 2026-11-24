"""Transfers between the user's own accounts, and transactions tied to accounts.

A transfer is neither income nor expense: it must never reach the dashboard
totals or a tax form. Pinned here:

* the pure rules: a transfer's type and category travel together, its tax
  fields are forced off, and its two accounts differ;
* create and update through the service apply those rules and check that the
  accounts are the caller's;
* the dashboard summary leaves transfers out;
* the account filter on the transaction list matches either side of a transfer.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.tags import CATEGORY_TO_SCHEDULE_E, transaction_type_for_category
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.transactions import summary_repo, transaction_list_repo
from app.services.transactions import transaction_service
from app.services.transactions.foreign_reference_error import ForeignReferenceError
from app.services.transactions.transfer_rules import TransferRuleError, transfer_overrides

_DATE = _dt.date(2026, 10, 5)


class TestTransferRules:
    def test_transfer_is_its_own_type(self) -> None:
        assert transaction_type_for_category("transfer") == "transfer"
        assert CATEGORY_TO_SCHEDULE_E["transfer"] is None

    def test_a_transfer_has_its_tax_fields_forced_off(self) -> None:
        overrides = transfer_overrides(
            transaction_type="transfer", category="transfer",
            account_id=uuid.uuid4(), transfer_to_account_id=uuid.uuid4(),
        )
        assert overrides == {
            "tax_relevant": False,
            "schedule_e_line": None,
            "is_capital_improvement": False,
            "placed_in_service_date": None,
        }

    @pytest.mark.parametrize(
        ("transaction_type", "category"),
        [("transfer", "maintenance"), ("expense", "transfer"), ("income", "transfer")],
    )
    def test_type_and_category_must_agree(self, transaction_type: str, category: str) -> None:
        with pytest.raises(TransferRuleError):
            transfer_overrides(
                transaction_type=transaction_type, category=category,
                account_id=None, transfer_to_account_id=None,
            )

    def test_a_transfer_to_the_same_account_is_refused(self) -> None:
        same = uuid.uuid4()
        with pytest.raises(TransferRuleError, match="different"):
            transfer_overrides(
                transaction_type="transfer", category="transfer",
                account_id=same, transfer_to_account_id=same,
            )

    def test_a_non_transfer_drops_its_destination(self) -> None:
        assert transfer_overrides(
            transaction_type="expense", category="maintenance",
            account_id=None, transfer_to_account_id=uuid.uuid4(),
        ) == {"transfer_to_account_id": None}

    def test_a_plain_expense_is_left_alone(self) -> None:
        assert transfer_overrides(
            transaction_type="expense", category="maintenance",
            account_id=uuid.uuid4(), transfer_to_account_id=None,
        ) == {}


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


async def _account(
    db: AsyncSession, org: Organization, user_id: uuid.UUID, name: str, account_type: str = "checking",
) -> FinancialAccount:
    account = FinancialAccount(
        organization_id=org.id, user_id=user_id, name=name, account_type=account_type,
    )
    db.add(account)
    await db.commit()
    return account


def _manual(**fields: object) -> dict[str, object]:
    data: dict[str, object] = {
        "transaction_date": _DATE,
        "vendor": "Chase",
        "amount": Decimal("500.00"),
        "transaction_type": "expense",
        "category": "maintenance",
        "tax_relevant": True,
    }
    data.update(fields)
    return data


class TestCreateAndUpdateThroughTheService:
    @pytest.mark.asyncio
    async def test_a_transfer_is_saved_with_no_tax_effect(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        checking = await _account(db, test_org, test_user.id, "Checking")
        card = await _account(db, test_org, test_user.id, "Card", "credit_card")

        with _service_session(db):
            txn = await transaction_service.create_manual_transaction(
                _ctx(test_org, test_user),
                _manual(
                    transaction_type="transfer", category="transfer",
                    account_id=checking.id, transfer_to_account_id=card.id,
                ),
            )

        assert txn.transaction_type == "transfer"
        assert txn.tax_relevant is False
        assert txn.schedule_e_line is None
        assert (txn.account_id, txn.transfer_to_account_id) == (checking.id, card.id)

    @pytest.mark.asyncio
    async def test_retyping_an_expense_as_a_transfer_clears_its_schedule_e_line(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        checking = await _account(db, test_org, test_user.id, "Checking")
        with _service_session(db):
            txn = await transaction_service.create_manual_transaction(
                _ctx(test_org, test_user), _manual(account_id=checking.id),
            )
            assert txn.schedule_e_line is not None
            result = await transaction_service.update_transaction(
                _ctx(test_org, test_user), txn.id,
                {"transaction_type": "transfer", "category": "transfer"},
            )
        assert result is not None
        updated, _ = result
        assert updated.schedule_e_line is None
        assert updated.tax_relevant is False

    @pytest.mark.asyncio
    async def test_a_mismatched_transfer_is_refused(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _service_session(db), pytest.raises(TransferRuleError):
            await transaction_service.create_manual_transaction(
                _ctx(test_org, test_user), _manual(transaction_type="transfer"),
            )

    @pytest.mark.asyncio
    async def test_another_person_s_account_is_refused(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        theirs = await _account(db, test_org, uuid.uuid4(), "Teammate checking")
        with _service_session(db), pytest.raises(ForeignReferenceError, match="account_id"):
            await transaction_service.create_manual_transaction(
                _ctx(test_org, test_user), _manual(account_id=theirs.id),
            )

    @pytest.mark.asyncio
    async def test_the_account_can_be_cleared(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        checking = await _account(db, test_org, test_user.id, "Checking")
        with _service_session(db):
            txn = await transaction_service.create_manual_transaction(
                _ctx(test_org, test_user), _manual(account_id=checking.id),
            )
            result = await transaction_service.update_transaction(
                _ctx(test_org, test_user), txn.id, {"account_id": None},
            )
        assert result is not None
        assert result[0].account_id is None


def _row(org: Organization, user: User, **fields: object) -> Transaction:
    base: dict[str, object] = {
        "organization_id": org.id,
        "user_id": user.id,
        "transaction_date": _DATE,
        "tax_year": _DATE.year,
        "amount": Decimal("100.00"),
        "transaction_type": "expense",
        "category": "maintenance",
        "status": "approved",
    }
    base.update(fields)
    return Transaction(**base)


class TestTransfersStayOutOfTotals:
    @pytest.mark.asyncio
    async def test_the_dashboard_summary_leaves_transfers_out(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        db.add_all([
            _row(test_org, test_user, amount=Decimal("100.00")),
            _row(
                test_org, test_user, amount=Decimal("2500.00"),
                transaction_type="transfer", category="transfer",
            ),
        ])
        await db.commit()

        rows = await summary_repo.txn_sum_by_category(db, test_org.id)

        assert {row.tag: row.total for row in rows} == {"maintenance": Decimal("100.00")}
        assert await summary_repo.distinct_transaction_years(db, test_org.id) == [_DATE.year]


class TestAccountFilter:
    @pytest.mark.asyncio
    async def test_matches_either_side_of_a_transfer(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        checking = await _account(db, test_org, test_user.id, "Checking")
        card = await _account(db, test_org, test_user.id, "Card", "credit_card")
        spent = _row(test_org, test_user, vendor="Home Depot", account_id=card.id)
        paid_off = _row(
            test_org, test_user, vendor="Card payment", transaction_type="transfer",
            category="transfer", account_id=checking.id, transfer_to_account_id=card.id,
        )
        unrelated = _row(test_org, test_user, vendor="No account")
        db.add_all([spent, paid_off, unrelated])
        await db.commit()

        on_card = await transaction_list_repo.list_filtered(db, test_org.id, account_id=card.id)
        on_checking = await transaction_list_repo.list_filtered(db, test_org.id, account_id=checking.id)

        assert {t.vendor for t in on_card} == {"Home Depot", "Card payment"}
        assert {t.vendor for t in on_checking} == {"Card payment"}
