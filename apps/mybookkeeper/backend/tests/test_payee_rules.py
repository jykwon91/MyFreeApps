"""Payee rules: a rule files a payment's category, scope, and property or even split.

Pinned here: a rule files a new bank row as it syncs; "apply to past" counts
and refiles only rows no person filed, and only the ones it would change; a
rule never files a refund, a transfer or a personal row it says nothing about;
a person's edit marks the row so no rule (learned or set up) refiles it; and
the API checks the split it is given.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.payee_rule_constants import RULE_PAST_ONLY_PAYEES, RULE_PROPERTY_NOT_FOUND
from app.models.classification.classification_rule import ClassificationRule
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.integrations.plaid_item import PlaidItem
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.classification import classification_rule_repo
from app.schemas.classification.rule_filing import RuleFiling
from app.schemas.plaid.plaid_sync_batch import PlaidSyncBatch
from app.schemas.plaid.wire.plaid_wire_transaction import PlaidWireTransaction
from app.services.classification import rule_actions, rule_service
from app.services.plaid import plaid_sync_service
from tests import test_transaction_routes as routes

client = routes.client
org = routes.org
owner = routes.owner
_patch_service_session = routes._patch_service_session

JASON_LAW = "Zelle payment to Jason Law"
_CLIENT = "app.services.plaid.plaid_sync_service.plaid_client.sync_transactions"


@pytest.fixture(autouse=True)
def _patch_sessions(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _fake_session():
        yield db
        await db.flush()

    with (
        patch("app.services.classification.rule_service.AsyncSessionLocal", _fake_session),
        patch("app.services.classification.rule_service.unit_of_work", _fake_session),
        patch("app.services.transactions.property_split_service.unit_of_work", _fake_session),
    ):
        yield


@pytest_asyncio.fixture()
async def houses(db: AsyncSession, org: Organization, owner: User) -> list[Property]:
    props = [
        Property(id=uuid.uuid4(), organization_id=org.id, user_id=owner.id, name=name, address=name)
        for name in ("6732 Peerless", "6734 Peerless", "6738 Peerless")
    ]
    db.add_all(props)
    await db.commit()
    return props


def _row(
    org: Organization, owner: User, *, vendor: str = JASON_LAW, amount: str = "100.00",
    transaction_type: str = "expense", category: str = "other_expense", scope: str = "rental",
    status: str = "approved", property_id: uuid.UUID | None = None,
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(), organization_id=org.id, user_id=owner.id, transaction_date=_dt.date(2026, 6, 1),
        tax_year=2026, vendor=vendor, amount=Decimal(amount), transaction_type=transaction_type,
        category=category, status=status, transaction_scope=scope, property_id=property_id,
        tax_relevant=scope != "personal", tags=[category],
    )


async def _rule(
    db: AsyncSession, org: Organization, owner: User, *, category: str = "maintenance",
    scope: str | None = "rental", property_id: uuid.UUID | None = None,
    split: list[uuid.UUID] | None = None, pattern: str = JASON_LAW,
) -> ClassificationRule:
    rule = await classification_rule_repo.upsert_rule(
        db, organization_id=org.id, match_type="vendor", pattern=pattern, category=category,
        created_by=owner.id, source="manual", property_id=property_id,
        filing=RuleFiling(transaction_scope=scope, split_property_ids=split or []),
    )
    await db.commit()
    return rule


def _shares(txn: Transaction) -> list[tuple[uuid.UUID | None, Decimal]]:
    return sorted(((s.property_id, s.amount) for s in txn.property_splits), key=str)


class TestFileByRule:
    @pytest.mark.asyncio
    async def test_splits_evenly_and_sets_category_and_scope(self, db, org, owner, houses) -> None:
        rule = await _rule(db, org, owner, split=[h.id for h in houses])
        txn = _row(org, owner, scope="personal")
        db.add(txn)
        await db.flush()

        assert await rule_actions.file_by_rule(db, txn, rule) is True

        assert (txn.category, txn.transaction_scope, txn.property_id) == ("maintenance", "rental", None)
        assert txn.tax_relevant is True
        assert txn.schedule_e_line == "line_7_cleaning_maintenance"
        assert _shares(txn) == sorted(
            [(houses[0].id, Decimal("33.34")), (houses[1].id, Decimal("33.33")), (houses[2].id, Decimal("33.33"))],
            key=str,
        )
        assert txn.filed_by_person_at is None
        assert rule.times_applied == 1

    @pytest.mark.asyncio
    async def test_files_one_property(self, db, org, owner, houses) -> None:
        rule = await _rule(db, org, owner, category="cleaning_expense", property_id=houses[1].id)
        txn = _row(org, owner)
        db.add(txn)
        await db.flush()

        await rule_actions.file_by_rule(db, txn, rule)

        assert (txn.category, txn.property_id, txn.property_splits) == ("cleaning_expense", houses[1].id, [])

    @pytest.mark.asyncio
    async def test_leaves_a_refund_a_transfer_and_an_ignored_row_alone(self, db, org, owner, houses) -> None:
        rule = await _rule(db, org, owner, property_id=houses[0].id)
        refund = _row(org, owner, transaction_type="income", category="uncategorized")
        transfer = _row(org, owner, transaction_type="transfer", category="uncategorized")
        duplicate = _row(org, owner, status="duplicate")

        for txn in (refund, transfer, duplicate):
            assert rule_actions.rule_applies_to(rule, txn) is False

    @pytest.mark.asyncio
    async def test_a_rule_with_no_scope_leaves_personal_rows_alone(self, db, org, owner, houses) -> None:
        rule = await _rule(db, org, owner, scope=None, property_id=houses[0].id)

        assert rule_actions.rule_applies_to(rule, _row(org, owner, scope="personal")) is False
        assert rule_actions.rule_applies_to(rule, _row(org, owner, scope="rental")) is True

    @pytest.mark.asyncio
    async def test_a_payment_too_small_to_split_is_left_unsplit(self, db, org, owner, houses) -> None:
        rule = await _rule(db, org, owner, split=[h.id for h in houses])
        txn = _row(org, owner, amount="0.02")
        db.add(txn)
        await db.flush()

        await rule_actions.file_by_rule(db, txn, rule)

        assert txn.category == "maintenance"
        assert txn.property_splits == []


class TestApplyToPast:
    @pytest.mark.asyncio
    async def test_counts_and_refiles_only_rows_no_person_filed(self, db, org, owner, houses) -> None:
        rule = await _rule(db, org, owner, split=[h.id for h in houses])
        unfiled = [_row(org, owner, vendor=f"{JASON_LAW} conf# {n}") for n in range(3)]
        filed = _row(org, owner)
        filed.filed_by_person_at = _dt.datetime.now(_dt.timezone.utc)
        other_payee = _row(org, owner, vendor="Zelle payment to Silvia")
        db.add_all([*unfiled, filed, other_payee])
        await db.commit()

        assert await rule_service.count_past_matches(rule.id, org.id) == 3
        assert await rule_service.apply_to_past(rule.id, org.id) == 3

        for txn in unfiled:
            assert txn.category == "maintenance"
            assert len(txn.property_splits) == 3
        assert filed.category == "other_expense"
        assert filed.property_splits == []
        assert other_payee.category == "other_expense"
        # Already filed that way: nothing left to change.
        assert await rule_service.count_past_matches(rule.id, org.id) == 0

    @pytest.mark.asyncio
    async def test_only_a_payee_rule_applies_to_the_past(self, db, org, owner) -> None:
        rule = await classification_rule_repo.upsert_rule(
            db, organization_id=org.id, match_type="sender", pattern="billing@example.com",
            category="utilities", created_by=owner.id, source="manual",
        )
        await db.commit()

        with pytest.raises(ValueError, match=RULE_PAST_ONLY_PAYEES):
            await rule_service.count_past_matches(rule.id, org.id)

    @pytest.mark.asyncio
    async def test_another_workspaces_rule_is_not_found(self, db, org, owner) -> None:
        rule = await _rule(db, org, owner)

        assert await rule_service.count_past_matches(rule.id, uuid.uuid4()) is None
        assert await rule_service.apply_to_past(rule.id, uuid.uuid4()) is None


class TestPersonEditsAreKept:
    @pytest.mark.asyncio
    async def test_an_edit_marks_the_row_and_learning_skips_marked_rows(
        self, client: AsyncClient, db: AsyncSession, org, owner, houses,
    ) -> None:
        edited = _row(org, owner)
        kept = _row(org, owner, category="other_expense", property_id=houses[2].id)
        kept.filed_by_person_at = _dt.datetime.now(_dt.timezone.utc)
        fresh = _row(org, owner)
        db.add_all([edited, kept, fresh])
        await db.commit()

        resp = await client.patch(f"/transactions/{edited.id}", json={"category": "maintenance"})
        assert resp.status_code == 200, resp.text

        await db.refresh(edited)
        await db.refresh(kept)
        await db.refresh(fresh)
        assert edited.filed_by_person_at is not None
        assert fresh.category == "maintenance"
        assert kept.category == "other_expense"

    @pytest.mark.asyncio
    async def test_splitting_marks_the_row(self, client: AsyncClient, db: AsyncSession, org, owner, houses) -> None:
        txn = _row(org, owner)
        db.add(txn)
        await db.commit()

        resp = await client.put(
            f"/transactions/{txn.id}/property-splits", json={"even_across": [str(h.id) for h in houses]},
        )
        assert resp.status_code == 200, resp.text

        await db.refresh(txn)
        assert txn.filed_by_person_at is not None


class TestPlaidSync:
    @pytest.mark.asyncio
    async def test_a_new_bank_row_is_filed_by_the_rule(self, db, org, owner, houses) -> None:
        await _rule(db, org, owner, split=[h.id for h in houses])
        item = PlaidItem(
            id=uuid.uuid4(), organization_id=org.id, user_id=owner.id,
            plaid_item_id=f"item-{uuid.uuid4()}", institution_name="Chase", status="active",
        )
        item.access_token = "access-sandbox-secret"
        db.add(item)
        db.add(FinancialAccount(
            id=uuid.uuid4(), organization_id=org.id, user_id=owner.id, name="Chase checking",
            institution_name="Chase", account_type="checking", plaid_item_id=item.id,
            plaid_account_id="plaid-chase", default_transaction_scope="personal",
        ))
        await db.commit()
        batch = PlaidSyncBatch(
            added=[PlaidWireTransaction(
                transaction_id="zelle-1", account_id="plaid-chase", amount=Decimal("300.00"),
                date=_dt.date(2026, 11, 20), name=f"{JASON_LAW} JPM99abc",
            )],
            modified=[], removed=[], accounts=[], next_cursor="c",
        )

        @asynccontextmanager
        async def _uow():
            yield db
            await db.commit()

        with patch.object(plaid_sync_service, "unit_of_work", _uow), patch(_CLIENT, AsyncMock(return_value=batch)):
            await plaid_sync_service.sync_item(item.id)

        txn = (await db.execute(
            select(Transaction).where(Transaction.organization_id == org.id)
            .execution_options(populate_existing=True),
        )).scalar_one()
        assert (txn.category, txn.transaction_scope, txn.property_id) == ("maintenance", "rental", None)
        assert sorted(s.amount for s in txn.property_splits) == [Decimal("100.00")] * 3
        assert txn.filed_by_person_at is None


class TestRulesApi:
    @pytest.mark.asyncio
    async def test_creates_a_split_rule_then_applies_it_to_the_past(
        self, client: AsyncClient, db: AsyncSession, org, owner, houses,
    ) -> None:
        db.add_all([_row(org, owner), _row(org, owner)])
        await db.commit()

        resp = await client.post("/classification-rules", json={
            "match_type": "vendor", "match_pattern": JASON_LAW, "category": "maintenance",
            "transaction_scope": "rental", "split_property_ids": [str(h.id) for h in houses],
        })
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["transaction_scope"] == "rental"
        assert body["split_property_ids"] == [str(h.id) for h in houses]

        count = await client.get(f"/classification-rules/{body['id']}/past-matches")
        assert count.json() == {"count": 2}
        applied = await client.post(f"/classification-rules/{body['id']}/apply-to-past")
        assert applied.json() == {"applied": 2}

    @pytest.mark.asyncio
    @pytest.mark.parametrize("extra", [
        {"split_property_ids": ["one"]},
        {"transaction_scope": "personal", "property_id": "house"},
        {"property_id": "house", "split_property_ids": ["house", "other"]},
        {"split_property_ids": ["house", "house"]},
    ])
    async def test_rejects_a_split_it_cant_file(
        self, client: AsyncClient, houses, extra: dict[str, object],
    ) -> None:
        ids = {"one": houses[0].id, "house": houses[0].id, "other": houses[1].id}

        def _resolve(value: object) -> object:
            if isinstance(value, list):
                return [str(ids[v]) for v in value]
            return str(ids[value]) if value in ids else value

        resp = await client.post("/classification-rules", json={
            "match_type": "vendor", "match_pattern": JASON_LAW, "category": "maintenance",
            **{key: _resolve(value) for key, value in extra.items()},
        })
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_rejects_another_workspaces_property(self, client: AsyncClient, houses) -> None:
        resp = await client.post("/classification-rules", json={
            "match_type": "vendor", "match_pattern": JASON_LAW, "category": "maintenance",
            "split_property_ids": [str(houses[0].id), str(uuid.uuid4())],
        })
        assert resp.status_code == 422
        assert resp.json()["detail"] == RULE_PROPERTY_NOT_FOUND
