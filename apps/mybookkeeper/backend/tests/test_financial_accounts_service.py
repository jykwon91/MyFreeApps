"""Financial accounts against a real (SQLite) database.

The service opens its own session through ``unit_of_work``; each test patches
it to the test session so commits behave as they do in production.

What is pinned here: an account is one person's (a teammate in the same
workspace cannot see or change it), totals add up only open accounts with a
balance and never mix currencies, the balance/as-of pair and the mortgage link
are enforced against the merged row, and a delete can be undone.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mortgage.mortgage import Mortgage
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.user.user import User
from app.schemas.financial_accounts.financial_account_create_request import (
    FinancialAccountCreateRequest,
)
from app.services.financial_accounts import financial_account_service as svc

pytestmark = pytest.mark.asyncio

_AS_OF = _dt.date(2026, 11, 1)


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(svc, "unit_of_work", _uow):
        yield


def _payload(**overrides: object) -> FinancialAccountCreateRequest:
    base: dict[str, object] = {"name": "Chase Checking", "account_type": "checking"}
    base.update(overrides)
    return FinancialAccountCreateRequest(**base)


async def _create(db: AsyncSession, org: Organization, user: User, **overrides: object):
    with _session(db):
        return await svc.create_account(
            user_id=user.id, organization_id=org.id, payload=_payload(**overrides),
        )


async def _mortgage(db: AsyncSession, org: Organization, user: User) -> Mortgage:
    prop = Property(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        name="6734 Peerless", address="6734 Peerless St",
    )
    db.add(prop)
    mortgage = Mortgage(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        property_id=prop.id, rate_type="fixed",
    )
    db.add(mortgage)
    await db.commit()
    return mortgage


class TestCreateAndList:
    async def test_derives_the_classification_from_the_type(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        card = await _create(db, test_org, test_user, name="Sapphire", account_type="credit_card")
        checking = await _create(db, test_org, test_user)

        assert card.classification == "liability"
        assert checking.classification == "asset"
        assert checking.currency == "USD"

    async def test_totals_count_open_accounts_with_a_balance_per_currency(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _create(db, test_org, test_user, current_balance_cents=500_000, balance_as_of=_AS_OF)
        await _create(
            db, test_org, test_user, name="Card", account_type="credit_card",
            current_balance_cents=120_000, balance_as_of=_AS_OF,
        )
        # No balance yet: adds nothing, rather than a guessed zero.
        await _create(db, test_org, test_user, name="TDECU Savings", account_type="savings")
        closed = await _create(
            db, test_org, test_user, name="Old checking",
            current_balance_cents=99_999, balance_as_of=_AS_OF,
        )
        with _session(db):
            await svc.update_account(
                account_id=closed.id, user_id=test_user.id, organization_id=test_org.id,
                fields={"closed_on": _AS_OF},
            )
        await _create(
            db, test_org, test_user, name="Euro account", currency="eur",
            current_balance_cents=10_000, balance_as_of=_AS_OF,
        )

        with _session(db):
            result = await svc.list_accounts(user_id=test_user.id, organization_id=test_org.id)

        assert len(result.items) == 5, "closed accounts are still listed"
        by_currency = {t.currency: t for t in result.totals}
        assert by_currency["USD"].assets_cents == 500_000
        assert by_currency["USD"].liabilities_cents == 120_000
        assert by_currency["USD"].net_cents == 380_000
        assert by_currency["EUR"].net_cents == 10_000

    async def test_a_teammate_cannot_see_or_edit_my_account(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        mine = await _create(db, test_org, test_user)
        teammate = uuid.uuid4()

        with _session(db):
            listed = await svc.list_accounts(user_id=teammate, organization_id=test_org.id)
            assert listed.items == []
            with pytest.raises(svc.FinancialAccountNotFoundError):
                await svc.update_account(
                    account_id=mine.id, user_id=teammate, organization_id=test_org.id,
                    fields={"name": "Mine now"},
                )


class TestUpdate:
    async def test_clearing_half_of_the_balance_pair_is_refused(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        account = await _create(
            db, test_org, test_user, current_balance_cents=100, balance_as_of=_AS_OF,
        )
        with _session(db), pytest.raises(svc.InvalidFinancialAccountError, match="balance"):
            await svc.update_account(
                account_id=account.id, user_id=test_user.id, organization_id=test_org.id,
                fields={"balance_as_of": None},
            )

    async def test_updating_the_balance_records_the_new_figure_and_date(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        account = await _create(
            db, test_org, test_user, current_balance_cents=100, balance_as_of=_AS_OF,
        )
        with _session(db):
            updated = await svc.update_account(
                account_id=account.id, user_id=test_user.id, organization_id=test_org.id,
                fields={"current_balance_cents": -2_500, "balance_as_of": _dt.date(2026, 11, 20)},
            )
        assert updated.current_balance_cents == -2_500, "an overdraft is a real balance"
        assert updated.balance_as_of == _dt.date(2026, 11, 20)

    async def test_a_name_cannot_be_cleared(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        account = await _create(db, test_org, test_user)
        with _session(db), pytest.raises(svc.InvalidFinancialAccountError, match="name"):
            await svc.update_account(
                account_id=account.id, user_id=test_user.id, organization_id=test_org.id,
                fields={"name": None},
            )

    async def test_an_unknown_field_is_refused(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        account = await _create(db, test_org, test_user)
        with _session(db), pytest.raises(svc.InvalidFinancialAccountError, match="user_id"):
            await svc.update_account(
                account_id=account.id, user_id=test_user.id, organization_id=test_org.id,
                fields={"user_id": uuid.uuid4()},
            )


class TestMortgageLink:
    async def test_only_a_mortgage_account_links_a_mortgage(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        mortgage = await _mortgage(db, test_org, test_user)
        with pytest.raises(svc.InvalidFinancialAccountError, match="mortgage"):
            await _create(db, test_org, test_user, mortgage_id=mortgage.id)

    async def test_one_live_account_per_mortgage(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        mortgage = await _mortgage(db, test_org, test_user)
        await _create(
            db, test_org, test_user, name="TDECU Mortgage", account_type="mortgage",
            mortgage_id=mortgage.id,
        )
        with pytest.raises(svc.InvalidFinancialAccountError, match="already linked"):
            await _create(
                db, test_org, test_user, name="Duplicate", account_type="mortgage",
                mortgage_id=mortgage.id,
            )

    async def test_someone_else_s_mortgage_is_refused(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with pytest.raises(svc.InvalidFinancialAccountError, match="does not name"):
            await _create(
                db, test_org, test_user, account_type="mortgage", mortgage_id=uuid.uuid4(),
            )


class TestDeleteAndRestore:
    async def test_a_deleted_account_disappears_and_undo_brings_it_back(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        account = await _create(db, test_org, test_user)
        scope = {"user_id": test_user.id, "organization_id": test_org.id}

        with _session(db):
            await svc.delete_account(account_id=account.id, **scope)
            assert (await svc.list_accounts(**scope)).items == []
            with pytest.raises(svc.FinancialAccountNotFoundError):
                await svc.get_account(account_id=account.id, **scope)

            restored = await svc.restore_account(account_id=account.id, **scope)
            assert restored.id == account.id
            assert [a.id for a in (await svc.list_accounts(**scope)).items] == [account.id]

    async def test_deleting_twice_is_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        account = await _create(db, test_org, test_user)
        scope = {"user_id": test_user.id, "organization_id": test_org.id}
        with _session(db):
            await svc.delete_account(account_id=account.id, **scope)
            with pytest.raises(svc.FinancialAccountNotFoundError):
                await svc.delete_account(account_id=account.id, **scope)
