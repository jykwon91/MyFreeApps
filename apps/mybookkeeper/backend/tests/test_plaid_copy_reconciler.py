"""A bank sync doesn't store a second row for money an email or document
already brought in — through a real sync (SQLite), Plaid mocked at the
client seam.

Pinned here, on sync: the same Zelle rent from an email and the bank is one
row, the emailed row kept as filed and linked to the bank (so a later bank
withdrawal reaches it and a repeat id isn't added); two people paying the same
amount days apart, the same bill a month later, two possible matches, and a
row already linked to another source each still get their own bank row.
For rows already stored: the pair is folded into the emailed row (the synced
copy soft-deleted as ``duplicate``), once; an ambiguous pair and a pair the
person marked "not duplicates" are left alone; and the copy's open rent review
is closed when the kept row already has its tenant.
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
from app.models.transactions.rent_attribution_review_queue import RentAttributionReviewQueue
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.schemas.plaid.plaid_sync_batch import PlaidSyncBatch
from app.schemas.plaid.wire.plaid_wire_transaction import PlaidWireTransaction
from app.services.plaid import plaid_sync_service as svc

pytestmark = pytest.mark.asyncio

_CLIENT = "app.services.plaid.plaid_sync_service.plaid_client.sync_transactions"
_DAY = _dt.date(2026, 11, 16)
_ZELLE_NAME = "Zelle payment from SONU KING 31731713019"


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(svc, "unit_of_work", _uow):
        yield


def _batch(
    added: list[PlaidWireTransaction] | None = None, removed: list[str] | None = None,
) -> PlaidSyncBatch:
    return PlaidSyncBatch(
        added=added or [], modified=[], removed=removed or [], accounts=[], next_cursor="c",
    )


def _bank(
    transaction_id: str, name: str = _ZELLE_NAME, *, amount: str = "-338.50", day: _dt.date = _DAY,
) -> PlaidWireTransaction:
    # Plaid signs money in as negative.
    return PlaidWireTransaction(
        transaction_id=transaction_id, account_id="plaid-checking",
        amount=Decimal(amount), date=day, name=name, pending=False,
    )


async def _connection(db: AsyncSession, org: Organization, user: User) -> tuple[PlaidItem, FinancialAccount]:
    item = PlaidItem(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        plaid_item_id=f"item-{uuid.uuid4()}", institution_name="Chase", status="active",
    )
    item.access_token = "access-sandbox-secret"
    db.add(item)
    await db.flush()
    account = FinancialAccount(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name="Checking",
        account_type="checking", plaid_item_id=item.id, plaid_account_id="plaid-checking",
        default_transaction_scope="rental",
    )
    db.add(account)
    await db.commit()
    return item, account


async def _tenant(db: AsyncSession, org: Organization, user: User, name: str = "Sonu King") -> Applicant:
    applicant = Applicant(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, stage="lease_signed", legal_name=name,
    )
    db.add(applicant)
    await db.commit()
    return applicant


async def _on_file(
    db: AsyncSession, org: Organization, user: User, *,
    day: _dt.date = _DAY - _dt.timedelta(days=1), amount: str = "338.50",
    transaction_type: str = "income", category: str = "rental_revenue",
    vendor: str = "Zelle", payer_name: str | None = "Sonu King",
    description: str | None = "Zelle from Sonu King — memo: rent",
    applicant_id: uuid.UUID | None = None, **fields: object,
) -> Transaction:
    """A row an email or document extraction filed: no account, no source id."""
    row = Transaction(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        transaction_date=day, tax_year=day.year, amount=Decimal(amount),
        transaction_type=transaction_type, category=category, tags=[category],
        vendor=vendor, description=description, payer_name=payer_name,
        applicant_id=applicant_id, attribution_source="auto_exact" if applicant_id else None,
        status="approved", is_manual=False, **fields,
    )
    db.add(row)
    await db.commit()
    return row


async def _sync(db: AsyncSession, item: PlaidItem, batch: PlaidSyncBatch) -> None:
    with _session(db), patch(_CLIENT, AsyncMock(return_value=batch)):
        await svc.sync_item(item.id)


async def _rows(db: AsyncSession, org: Organization) -> list[Transaction]:
    result = await db.execute(
        select(Transaction)
        .where(Transaction.organization_id == org.id)
        .order_by(Transaction.created_at)
        .execution_options(populate_existing=True),
    )
    return list(result.scalars().all())


async def _get(db: AsyncSession, txn_id: uuid.UUID) -> Transaction:
    result = await db.execute(
        select(Transaction).where(Transaction.id == txn_id).execution_options(populate_existing=True),
    )
    return result.scalar_one()


def _live(rows: list[Transaction]) -> list[Transaction]:
    return [r for r in rows if r.deleted_at is None]


class TestOnSync:
    async def test_the_same_zelle_rent_from_an_email_and_the_bank_is_one_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item, account = await _connection(db, test_org, test_user)
        tenant = await _tenant(db, test_org, test_user)
        emailed = await _on_file(db, test_org, test_user, applicant_id=tenant.id)

        await _sync(db, item, _batch([_bank("z1")]))

        rows = await _rows(db, test_org)
        assert [r.id for r in rows] == [emailed.id]
        kept = rows[0]
        assert (kept.external_source, kept.external_id, kept.account_id) == ("plaid", "z1", account.id)
        assert kept.category == "rental_revenue"
        assert kept.applicant_id == tenant.id
        assert kept.transaction_date == _DAY - _dt.timedelta(days=1)

    async def test_a_repeat_id_is_not_added_and_a_withdrawal_reaches_the_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item, _ = await _connection(db, test_org, test_user)
        emailed = await _on_file(db, test_org, test_user)
        await _sync(db, item, _batch([_bank("z1")]))

        await _sync(db, item, _batch([_bank("z1")]))
        assert len(await _rows(db, test_org)) == 1

        await _sync(db, item, _batch(removed=["z1"]))
        assert (await _get(db, emailed.id)).deleted_at is not None

    async def test_a_different_payer_paying_the_same_amount_gets_its_own_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item, _ = await _connection(db, test_org, test_user)
        emailed = await _on_file(db, test_org, test_user)

        await _sync(db, item, _batch([_bank("j1", "Zelle payment from JANE DOE 4411")]))

        rows = _live(await _rows(db, test_org))
        assert len(rows) == 2
        assert (await _get(db, emailed.id)).external_id is None

    async def test_the_same_bill_a_month_later_gets_its_own_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item, _ = await _connection(db, test_org, test_user)
        october = await _on_file(
            db, test_org, test_user, day=_DAY - _dt.timedelta(days=31), transaction_type="expense",
            category="utilities", vendor="CenterPoint Energy", payer_name=None, description=None,
        )

        await _sync(db, item, _batch([_bank("c1", "CENTERPOINT ENERGY", amount="84.10")]))

        assert len(_live(await _rows(db, test_org))) == 2
        assert (await _get(db, october.id)).external_id is None

    async def test_the_same_bill_days_apart_is_one_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item, _ = await _connection(db, test_org, test_user)
        bill = await _on_file(
            db, test_org, test_user, day=_DAY - _dt.timedelta(days=2), amount="84.10",
            transaction_type="expense", category="utilities", vendor="CenterPoint Energy",
            payer_name=None, description=None,
        )

        await _sync(db, item, _batch([_bank("c1", "CENTERPOINT ENERGY", amount="84.10")]))

        assert [r.id for r in await _rows(db, test_org)] == [bill.id]
        assert (await _get(db, bill.id)).category == "utilities"

    async def test_two_possible_matches_leave_both_alone_and_add_the_bank_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item, _ = await _connection(db, test_org, test_user)
        first = await _on_file(db, test_org, test_user)
        second = await _on_file(db, test_org, test_user, day=_DAY - _dt.timedelta(days=3))

        await _sync(db, item, _batch([_bank("z1")]))

        assert len(_live(await _rows(db, test_org))) == 3
        assert (await _get(db, first.id)).external_id is None
        assert (await _get(db, second.id)).external_id is None

    async def test_a_row_already_linked_to_another_source_is_not_taken(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item, _ = await _connection(db, test_org, test_user)
        imported = await _on_file(
            db, test_org, test_user, external_source="bank_csv", external_id="csv-1",
        )

        await _sync(db, item, _batch([_bank("z1")]))

        assert len(_live(await _rows(db, test_org))) == 2
        kept = await _get(db, imported.id)
        assert (kept.external_source, kept.external_id) == ("bank_csv", "csv-1")


class TestAlreadyStored:
    async def _stored_pair(
        self, db: AsyncSession, org: Organization, user: User, *, applicant_id: uuid.UUID | None = None,
    ) -> tuple[PlaidItem, FinancialAccount, Transaction, Transaction]:
        """A bank row synced before the emailed row it copies was on file."""
        item, account = await _connection(db, org, user)
        await _sync(db, item, _batch([_bank("z1")]))
        synced = (await _rows(db, org))[0]
        emailed = await _on_file(db, org, user, applicant_id=applicant_id)
        return item, account, synced, emailed

    async def test_the_pair_is_folded_into_the_emailed_row_once(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item, account, synced, emailed = await self._stored_pair(db, test_org, test_user)

        await _sync(db, item, _batch())
        await _sync(db, item, _batch())

        kept = await _get(db, emailed.id)
        assert (kept.external_source, kept.external_id, kept.account_id) == ("plaid", "z1", account.id)
        assert kept.category == "rental_revenue"
        assert kept.deleted_at is None
        copy = await _get(db, synced.id)
        assert copy.deleted_at is not None
        assert copy.status == "duplicate"
        assert copy.external_id is None
        assert [r.id for r in _live(await _rows(db, test_org))] == [emailed.id]

    async def test_the_copys_open_rent_review_is_closed_when_the_kept_row_has_its_tenant(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        # The synced copy was read before its tenant existed and queued as
        # unmatched; the emailed row was filed to the tenant.
        item, _, synced, _ = await self._stored_pair(db, test_org, test_user)
        tenant = await _tenant(db, test_org, test_user)
        emailed = (await _rows(db, test_org))[1]
        emailed.applicant_id = tenant.id
        await db.commit()
        reviews = (await db.execute(
            select(RentAttributionReviewQueue).where(RentAttributionReviewQueue.transaction_id == synced.id),
        )).scalars().all()
        assert [r.status for r in reviews] == ["pending"]

        await _sync(db, item, _batch())

        review = (await db.execute(
            select(RentAttributionReviewQueue)
            .where(RentAttributionReviewQueue.id == reviews[0].id)
            .execution_options(populate_existing=True),
        )).scalar_one()
        assert review.status == "confirmed"

    async def test_an_ambiguous_pair_is_left_alone(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item, _, synced, emailed = await self._stored_pair(db, test_org, test_user)
        other = await _on_file(db, test_org, test_user, day=_DAY + _dt.timedelta(days=2))

        await _sync(db, item, _batch())

        assert len(_live(await _rows(db, test_org))) == 3
        for row_id in (emailed.id, other.id):
            assert (await _get(db, row_id)).external_id is None

    async def test_a_pair_marked_not_duplicates_is_left_alone(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item, _, synced, emailed = await self._stored_pair(db, test_org, test_user)
        reviewed = _dt.datetime(2026, 11, 20, tzinfo=_dt.timezone.utc)
        for row in (await _get(db, synced.id), await _get(db, emailed.id)):
            row.duplicate_reviewed_at = reviewed
        await db.commit()

        await _sync(db, item, _batch())

        assert len(_live(await _rows(db, test_org))) == 2
