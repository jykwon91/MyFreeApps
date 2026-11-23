"""PATCH /transactions/{id} corrects the utility type and metered usage of a row."""
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.transactions.metered_usage_check import (
    SERVICE_PERIOD_ORDER_MESSAGE,
    SERVICE_PERIOD_PAIR_MESSAGE,
)
from tests.test_transaction_routes import (
    _seed_transaction,
    _update_audit_rows,
)
from tests import test_transaction_routes as routes

# Fixtures shared with the route tests, bound by assignment so a test parameter
# of the same name is not a redefinition of an import.
acting_user = routes.acting_user
client = routes.client
org = routes.org
owner = routes.owner
_patch_service_session = routes._patch_service_session


async def _utility_bill(db: AsyncSession, org: Organization, owner: User) -> Transaction:
    txn = await _seed_transaction(db, org, owner, category="utilities")
    txn.sub_category = "water"
    txn.usage_quantity = 10
    txn.usage_unit = "kgal"
    txn.service_period_start = date(2025, 5, 1)
    txn.service_period_end = date(2025, 5, 31)
    await db.commit()
    return txn


class TestEditMeteredUsage:
    @pytest.mark.asyncio
    async def test_corrects_the_utility_type_and_usage(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _utility_bill(db, org, owner)

        resp = await client.patch(f"/transactions/{txn.id}", json={
            "sub_category": "electricity",
            "usage_quantity": "842.500",
            "usage_unit": "kwh",
            "service_period_start": "2025-06-01",
            "service_period_end": "2025-06-30",
        })

        assert resp.status_code == 200
        body = resp.json()
        assert body["sub_category"] == "electricity"
        assert (body["usage_quantity"], body["usage_unit"]) == ("842.500", "kwh")
        assert (body["service_period_start"], body["service_period_end"]) == ("2025-06-01", "2025-06-30")
        await db.commit()
        await db.refresh(txn)
        assert txn.sub_category == "electricity"
        assert txn.usage_unit == "kwh"

    @pytest.mark.asyncio
    async def test_each_edit_is_audited(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
        audit_listeners: None, acting_user: str,
    ) -> None:
        txn = await _utility_bill(db, org, owner)

        resp = await client.patch(f"/transactions/{txn.id}", json={
            "sub_category": "gas",
            "usage_quantity": "40",
            "usage_unit": "therm",
            "service_period_end": "2025-06-15",
        })

        assert resp.status_code == 200
        changed = {row[0] for row in await _update_audit_rows(db, txn.id) if row[3] == acting_user}
        assert {"sub_category", "usage_quantity", "usage_unit", "service_period_end"} <= changed

    @pytest.mark.asyncio
    @pytest.mark.parametrize("body", [{"usage_quantity": "5"}, {"usage_unit": "kwh"}])
    async def test_rejects_half_a_usage_pair(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
        body: dict[str, str],
    ) -> None:
        txn = await _utility_bill(db, org, owner)

        resp = await client.patch(f"/transactions/{txn.id}", json=body)

        assert resp.status_code == 422
        await db.refresh(txn)
        assert (txn.usage_quantity, txn.usage_unit) == (10, "kgal")

    @pytest.mark.asyncio
    async def test_rejects_an_unknown_sub_category(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _utility_bill(db, org, owner)

        resp = await client.patch(f"/transactions/{txn.id}", json={"sub_category": "cable"})

        assert resp.status_code == 422
        await db.refresh(txn)
        assert txn.sub_category == "water"


class TestServicePeriodAgainstTheStoredRow:
    @pytest.mark.asyncio
    async def test_moving_the_end_before_the_stored_start_is_rejected_in_plain_words(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _utility_bill(db, org, owner)

        resp = await client.patch(f"/transactions/{txn.id}", json={"service_period_end": "2025-04-01"})

        assert resp.status_code == 422
        assert resp.json()["detail"] == SERVICE_PERIOD_ORDER_MESSAGE
        await db.refresh(txn)
        assert txn.service_period_end == date(2025, 5, 31)

    @pytest.mark.asyncio
    async def test_a_one_sided_period_on_a_row_with_none_is_rejected(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, category="utilities")

        resp = await client.patch(f"/transactions/{txn.id}", json={"service_period_start": "2025-06-01"})

        assert resp.status_code == 422
        assert resp.json()["detail"] == SERVICE_PERIOD_PAIR_MESSAGE
        await db.refresh(txn)
        assert txn.service_period_start is None

    @pytest.mark.asyncio
    async def test_usage_on_a_row_with_no_usage_needs_both_halves(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, category="utilities")

        resp = await client.patch(f"/transactions/{txn.id}", json={"usage_unit": "kwh"})

        assert resp.status_code == 422
        await db.refresh(txn)
        assert txn.usage_unit is None
