"""Money sent to yourself that two banks show at different amounts is one
transfer row — through a real sync (SQLite), Plaid mocked at the client seam.

Pinned here: $680.00 out of Wise as "Jason Kwon (Sent)" and $678.87 into Chase
"Via WISE" on the same sync become one transfer from Wise to Chase, at the
amount that left, the row in soft-deleted as ``duplicate``; a pair stored
before the rule is folded on the next sync, once; a later sync never brings
the row in back; and a row in that is filed as a tenant's payment, a row in
with a twin candidate, a row out that names someone else and a row out to a
payee tagged a mortgage are left alone.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.integrations.plaid_item import PlaidItem
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.transactions import loan_payee_repo
from app.schemas.plaid.plaid_sync_batch import PlaidSyncBatch
from app.schemas.plaid.wire.plaid_wire_category import PlaidWireCategory
from app.schemas.plaid.wire.plaid_wire_transaction import PlaidWireTransaction
from app.services.plaid import plaid_sync_service as svc

pytestmark = pytest.mark.asyncio

_CLIENT = "app.services.plaid.plaid_sync_service.plaid_client.sync_transactions"
_DAY = _dt.date(2026, 11, 6)


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(svc, "unit_of_work", _uow):
        yield


def _batch(added: list[PlaidWireTransaction] | None = None) -> PlaidSyncBatch:
    return PlaidSyncBatch(added=added or [], modified=[], removed=[], accounts=[], next_cursor="c")


def _wise_out(transaction_id: str = "wise-out", *, amount: str = "680.00", name: str = "Jason Kwon (Sent)") -> PlaidWireTransaction:
    return PlaidWireTransaction(
        transaction_id=transaction_id, account_id="plaid-wise", amount=Decimal(amount), date=_DAY,
        name=name, pending=False, personal_finance_category=PlaidWireCategory(primary="TRANSFER_OUT", detailed=None),
    )


def _chase_in(transaction_id: str = "chase-in", *, amount: str = "-678.87", account_id: str = "plaid-chase") -> PlaidWireTransaction:
    # Plaid signs money in as negative.
    return PlaidWireTransaction(
        transaction_id=transaction_id, account_id=account_id, amount=Decimal(amount), date=_DAY,
        name="REAL TIME TRANSFER RECD Via WISE", pending=False,
        personal_finance_category=PlaidWireCategory(primary="TRANSFER_IN", detailed=None),
    )


async def _connected(
    db: AsyncSession, org: Organization, user: User, *, institution: str, plaid_account_id: str,
) -> tuple[PlaidItem, FinancialAccount]:
    item = PlaidItem(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        plaid_item_id=f"item-{uuid.uuid4()}", institution_name=institution, status="active",
    )
    item.access_token = "access-sandbox-secret"
    db.add(item)
    account = FinancialAccount(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name=f"{institution} checking",
        institution_name=institution, account_type="checking", plaid_item_id=item.id,
        plaid_account_id=plaid_account_id, default_transaction_scope="personal",
    )
    db.add(account)
    await db.commit()
    return item, account


async def _setup(db: AsyncSession, org: Organization, user: User) -> tuple[PlaidItem, FinancialAccount, PlaidItem, FinancialAccount]:
    user.name = "Jason Kwon"
    await db.commit()
    wise_item, wise = await _connected(db, org, user, institution="Wise", plaid_account_id="plaid-wise")
    chase_item, chase = await _connected(db, org, user, institution="Chase", plaid_account_id="plaid-chase")
    return wise_item, wise, chase_item, chase


async def _sync(db: AsyncSession, item: PlaidItem, batch: PlaidSyncBatch) -> object:
    with _session(db), patch(_CLIENT, AsyncMock(return_value=batch)):
        return await svc.sync_item(item.id)


async def _rows(db: AsyncSession, org: Organization) -> list[Transaction]:
    result = await db.execute(
        select(Transaction).where(Transaction.organization_id == org.id)
        .order_by(Transaction.created_at).execution_options(populate_existing=True),
    )
    return list(result.scalars().all())


def _live(rows: list[Transaction]) -> list[Transaction]:
    return [row for row in rows if row.deleted_at is None]


class TestSentToSelfWithAFee:
    async def test_the_two_legs_become_one_transfer_at_what_left(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        wise_item, wise, chase_item, chase = await _setup(db, test_org, test_user)
        await _sync(db, wise_item, _batch([_wise_out()]))
        result = await _sync(db, chase_item, _batch([_chase_in()]))

        assert result.transfers_matched == 1
        rows = await _rows(db, test_org)
        (transfer,) = _live(rows)
        assert transfer.transaction_type == "transfer"
        assert (transfer.account_id, transfer.transfer_to_account_id) == (wise.id, chase.id)
        assert transfer.amount == Decimal("680.00")
        assert transfer.transaction_date == _DAY
        assert transfer.external_id == "wise-out"
        (folded,) = [row for row in rows if row.deleted_at is not None]
        assert (folded.external_id, folded.status, folded.amount) == ("chase-in", "duplicate", Decimal("678.87"))

    async def test_a_pair_stored_before_is_folded_on_the_next_sync_once(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        wise_item, _, chase_item, _ = await _setup(db, test_org, test_user)
        with patch("app.services.plaid.plaid_transaction_applier.plaid_transfer_reconciler.merge_stored_self_transfers",
                   AsyncMock(return_value=0)):
            await _sync(db, wise_item, _batch([_wise_out()]))
            await _sync(db, chase_item, _batch([_chase_in()]))
        assert len(_live(await _rows(db, test_org))) == 2

        first = await _sync(db, wise_item, _batch())
        again = await _sync(db, chase_item, _batch())

        assert (first.transfers_matched, again.transfers_matched) == (1, 0)
        assert [row.transaction_type for row in _live(await _rows(db, test_org))] == ["transfer"]

    async def test_a_later_sync_never_brings_the_row_in_back(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        wise_item, _, chase_item, _ = await _setup(db, test_org, test_user)
        await _sync(db, wise_item, _batch([_wise_out()]))
        await _sync(db, chase_item, _batch([_chase_in()]))
        result = await _sync(db, chase_item, _batch([_chase_in()]))

        assert result.added == 0
        assert len(_live(await _rows(db, test_org))) == 1


class TestLeftAlone:
    async def test_a_row_out_to_someone_else(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        wise_item, _, chase_item, _ = await _setup(db, test_org, test_user)
        await _sync(db, wise_item, _batch([_wise_out(name="Nicole Santos Felix ()")]))
        result = await _sync(db, chase_item, _batch([_chase_in()]))

        assert result.transfers_matched == 0
        assert sorted(row.transaction_type for row in _live(await _rows(db, test_org))) == ["expense", "income"]

    async def test_two_candidate_rows_in(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        wise_item, _, chase_item, _ = await _setup(db, test_org, test_user)
        second_item, _ = await _connected(db, test_org, test_user, institution="Chase", plaid_account_id="plaid-chase-2")
        await _sync(db, second_item, _batch([_chase_in("chase-in-2", amount="-679.50", account_id="plaid-chase-2")]))
        await _sync(db, chase_item, _batch([_chase_in()]))
        await _sync(db, wise_item, _batch([_wise_out()]))

        assert all(row.transaction_type != "transfer" for row in await _rows(db, test_org))

    async def test_a_row_in_filed_as_a_tenants_payment(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        wise_item, _, chase_item, _ = await _setup(db, test_org, test_user)
        with patch("app.services.plaid.plaid_transaction_applier.plaid_transfer_reconciler.merge_stored_self_transfers",
                   AsyncMock(return_value=0)):
            await _sync(db, wise_item, _batch([_wise_out()]))
            await _sync(db, chase_item, _batch([_chase_in()]))
        applicant = Applicant(id=uuid.uuid4(), organization_id=test_org.id, user_id=test_user.id, legal_name="A Tenant")
        db.add(applicant)
        (row_in,) = [row for row in await _rows(db, test_org) if row.transaction_type == "income"]
        row_in.applicant_id = applicant.id
        await db.commit()

        result = await _sync(db, wise_item, _batch())

        assert result.transfers_matched == 0
        assert len(_live(await _rows(db, test_org))) == 2

    async def test_a_row_out_to_a_payee_tagged_a_mortgage(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        wise_item, _, chase_item, _ = await _setup(db, test_org, test_user)
        await loan_payee_repo.remember(
            db, organization_id=test_org.id, created_by_user_id=test_user.id,
            payee="Jason Kwon (Sent)", kind="mortgage",
        )
        await db.commit()
        await _sync(db, wise_item, _batch([_wise_out()]))
        result = await _sync(db, chase_item, _batch([_chase_in()]))

        assert result.transfers_matched == 0
        assert sorted(row.transaction_type for row in _live(await _rows(db, test_org))) == ["expense", "income"]
