"""Merging duplicates, or keeping one of them, must not lose what only the removed row held.

Repro behind these tests: a bank-import Zelle payment attributed to a tenant (A)
and the email copy of the same payment (B) with more fields filled in. B
survives, A is soft-deleted, and before the fix B never got A's tenant link, so
the payment fell off the tenant's rent ledger.
"""
import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.core.tags import CATEGORY_TO_SCHEDULE_E, transaction_type_for_category
from app.main import app
from app.models.leases.pending_rent_receipt import PendingRentReceipt
from app.models.organization.organization import Organization
from app.models.transactions.rent_attribution_review_queue import RentAttributionReviewQueue
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.rent import rent_charge_repo
from app.schemas.transactions.duplicate import DuplicateMergeFieldSource, DuplicateMergeOverrides
from app.services.transactions import transaction_service
from app.services.transactions.merge_conflict_error import MergeConflictError

TENANT = uuid.uuid4()
OTHER_TENANT = uuid.uuid4()
VENDOR = uuid.uuid4()
OTHER_VENDOR = uuid.uuid4()
ACTIVITY = uuid.uuid4()
OTHER_ACTIVITY = uuid.uuid4()


def _ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(organization_id=org.id, user_id=user.id, org_role="owner")


def _payment(org: Organization, user: User, **fields: object) -> Transaction:
    """A $1,500 rent payment; ``fields`` override any column."""
    category = str(fields.pop("category", "rental_revenue"))
    txn_date = fields.pop("transaction_date", date(2025, 6, 1))
    assert isinstance(txn_date, date)
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "organization_id": org.id,
        "user_id": user.id,
        "transaction_date": txn_date,
        "tax_year": txn_date.year,
        "vendor": "Zelle",
        "description": None,
        "amount": Decimal("1500.00"),
        "transaction_type": transaction_type_for_category(category),
        "category": category,
        "schedule_e_line": CATEGORY_TO_SCHEDULE_E.get(category),
        "tags": [],
        "status": "approved",
    }
    values.update(fields)
    return Transaction(**values)


def _patched(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db

    return (
        patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake),
        patch("app.services.transactions.transaction_service.unit_of_work", _fake),
    )


async def _merge(
    db: AsyncSession, org: Organization, user: User, a: Transaction, b: Transaction,
    survivor: Transaction, overrides: DuplicateMergeOverrides | None = None,
) -> Transaction:
    first, second = _patched(db)
    with first, second:
        return await transaction_service.merge_transactions(
            _ctx(org, user), a.id, b.id, survivor.id, overrides or DuplicateMergeOverrides(),
        )


async def _keep(
    db: AsyncSession, org: Organization, user: User, keep: Transaction, delete: list[Transaction],
) -> dict[str, int]:
    first, second = _patched(db)
    with first, second:
        return await transaction_service.keep_transaction(
            _ctx(org, user), keep.id, [t.id for t in delete],
        )


# Each case: what only the removed row holds, which the survivor must end up with.
CARRIED_FIELDS: list[dict[str, object]] = [
    {"applicant_id": TENANT, "attribution_source": "auto_exact"},
    {"vendor_id": VENDOR},
    {"activity_id": ACTIVITY},
    {"is_capital_improvement": True, "placed_in_service_date": date(2025, 6, 1)},
    {"tax_relevant": True},
    {"sub_category": "electricity"},
    {"usage_quantity": Decimal("0.000"), "usage_unit": "kwh"},
    {"service_period_start": date(2025, 5, 1), "service_period_end": date(2025, 5, 31)},
    {"payer_name": "Jane Tenant"},
    {"payer_handle": "jane@example.com"},
    {"address": "12 Main St"},
]


class TestMergeCarriesFields:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("fields", CARRIED_FIELDS, ids=lambda f: next(iter(f)))
    async def test_survivor_gets_field_only_removed_row_had(
        self, db: AsyncSession, test_org: Organization, test_user: User, fields: dict[str, object],
    ) -> None:
        removed = _payment(test_org, test_user, **fields)
        survivor = _payment(test_org, test_user, description="Zelle from Jane")
        db.add_all([removed, survivor])
        await db.commit()

        result = await _merge(db, test_org, test_user, removed, survivor, survivor)

        for field, value in fields.items():
            assert getattr(result, field) == value, field

    @pytest.mark.asyncio
    async def test_survivor_keeps_its_own_classification(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        removed = _payment(test_org, test_user, sub_category="water", payer_name="J Tenant")
        survivor = _payment(test_org, test_user, sub_category="electricity", payer_name="Jane Tenant")
        db.add_all([removed, survivor])
        await db.commit()

        result = await _merge(db, test_org, test_user, removed, survivor, survivor)

        assert result.sub_category == "electricity"
        assert result.payer_name == "Jane Tenant"

    @pytest.mark.asyncio
    async def test_payment_stays_on_tenant_rent_ledger(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        bank = _payment(test_org, test_user, applicant_id=TENANT, attribution_source="manual")
        email = _payment(
            test_org, test_user, description="Zelle payment from Jane", payment_method="bank_transfer",
        )
        db.add_all([bank, email])
        await db.commit()

        result = await _merge(db, test_org, test_user, bank, email, email)

        payments = await rent_charge_repo.list_payments_for_applicant(
            db, organization_id=test_org.id, applicant_id=TENANT,
        )
        assert [p.id for p in payments] == [result.id]


class TestMergeRefusesConflictingLinks:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("field", "a_value", "b_value", "label"),
        [
            ("applicant_id", TENANT, OTHER_TENANT, "tenants"),
            ("vendor_id", VENDOR, OTHER_VENDOR, "vendors"),
            ("activity_id", ACTIVITY, OTHER_ACTIVITY, "activities"),
        ],
    )
    async def test_different_links_refuse_and_change_nothing(
        self, db: AsyncSession, test_org: Organization, test_user: User,
        field: str, a_value: uuid.UUID, b_value: uuid.UUID, label: str,
    ) -> None:
        a = _payment(test_org, test_user, **{field: a_value})
        b = _payment(test_org, test_user, description="Zelle from Jane", **{field: b_value})
        db.add_all([a, b])
        await db.commit()

        with pytest.raises(MergeConflictError, match=f"linked to different {label}"):
            await _merge(db, test_org, test_user, a, b, b)

        assert a.deleted_at is None
        assert getattr(b, field) == b_value

    @pytest.mark.asyncio
    async def test_same_tenant_on_both_merges(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        a = _payment(test_org, test_user, applicant_id=TENANT)
        b = _payment(test_org, test_user, applicant_id=TENANT)
        db.add_all([a, b])
        await db.commit()

        result = await _merge(db, test_org, test_user, a, b, b)

        assert result.applicant_id == TENANT

    @pytest.mark.anyio
    async def test_merge_route_answers_409_with_the_reason(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        a = _payment(test_org, test_user, applicant_id=TENANT)
        b = _payment(test_org, test_user, applicant_id=OTHER_TENANT)
        db.add_all([a, b])
        await db.commit()

        app.dependency_overrides[current_org_member] = lambda: _ctx(test_org, test_user)
        first, second = _patched(db)
        try:
            with first, second:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post("/transactions/duplicates/merge", json={
                        "transaction_a_id": str(a.id),
                        "transaction_b_id": str(b.id),
                        "surviving_id": str(b.id),
                        "field_overrides": {},
                    })
        finally:
            del app.dependency_overrides[current_org_member]

        assert resp.status_code == 409
        assert "linked to different tenants" in resp.json()["detail"]

    @pytest.mark.anyio
    async def test_keep_route_answers_409_with_the_reason(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        kept = _payment(test_org, test_user, vendor_id=VENDOR)
        removed = _payment(test_org, test_user, vendor_id=OTHER_VENDOR)
        db.add_all([kept, removed])
        await db.commit()

        app.dependency_overrides[current_org_member] = lambda: _ctx(test_org, test_user)
        first, second = _patched(db)
        try:
            with first, second:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.post("/transactions/duplicates/keep", json={
                        "keep_id": str(kept.id), "delete_ids": [str(removed.id)],
                    })
        finally:
            del app.dependency_overrides[current_org_member]

        assert resp.status_code == 409
        assert "linked to different vendors" in resp.json()["detail"]


def _receipt(org: Organization, user: User, txn: Transaction, status: str) -> PendingRentReceipt:
    return PendingRentReceipt(
        id=uuid.uuid4(),
        user_id=user.id,
        organization_id=org.id,
        transaction_id=txn.id,
        applicant_id=TENANT,
        period_start_date=date(2025, 6, 1),
        period_end_date=date(2025, 6, 30),
        status=status,
    )


class TestMergeMovesReceiptsAndReviews:
    @pytest.mark.asyncio
    async def test_sent_receipt_moves_to_survivor(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        removed = _payment(test_org, test_user, applicant_id=TENANT)
        survivor = _payment(test_org, test_user)
        receipt = _receipt(test_org, test_user, removed, "sent")
        db.add_all([removed, survivor])
        await db.flush()
        db.add(receipt)
        await db.commit()

        await _merge(db, test_org, test_user, removed, survivor, survivor)

        await db.refresh(receipt)
        assert receipt.transaction_id == survivor.id
        assert receipt.status == "sent"

    @pytest.mark.asyncio
    async def test_open_receipt_moves_and_stays_sendable(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        removed = _payment(test_org, test_user, applicant_id=TENANT)
        survivor = _payment(test_org, test_user)
        receipt = _receipt(test_org, test_user, removed, "pending")
        db.add_all([removed, survivor])
        await db.flush()
        db.add(receipt)
        await db.commit()

        await _merge(db, test_org, test_user, removed, survivor, survivor)

        await db.refresh(receipt)
        assert receipt.transaction_id == survivor.id
        assert receipt.status == "pending"

    @pytest.mark.asyncio
    async def test_survivor_with_its_own_receipt_keeps_it(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        removed = _payment(test_org, test_user, applicant_id=TENANT)
        survivor = _payment(test_org, test_user, applicant_id=TENANT)
        removed_receipt = _receipt(test_org, test_user, removed, "pending")
        own_receipt = _receipt(test_org, test_user, survivor, "sent")
        db.add_all([removed, survivor])
        await db.flush()
        db.add_all([removed_receipt, own_receipt])
        await db.commit()

        await _merge(db, test_org, test_user, removed, survivor, survivor)

        await db.refresh(removed_receipt)
        await db.refresh(own_receipt)
        assert own_receipt.transaction_id == survivor.id
        assert removed_receipt.transaction_id == removed.id
        assert removed_receipt.status == "dismissed"

    @pytest.mark.asyncio
    async def test_open_attribution_review_moves_to_unattributed_survivor(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        removed = _payment(test_org, test_user)
        survivor = _payment(test_org, test_user)
        db.add_all([removed, survivor])
        await db.flush()
        review = RentAttributionReviewQueue(
            user_id=test_user.id,
            organization_id=test_org.id,
            transaction_id=removed.id,
            proposed_applicant_id=TENANT,
            confidence="fuzzy",
        )
        db.add(review)
        await db.commit()

        await _merge(db, test_org, test_user, removed, survivor, survivor)

        await db.refresh(review)
        assert review.transaction_id == survivor.id
        assert review.status == "pending"


class TestKeepCarriesFields:
    @pytest.mark.asyncio
    async def test_kept_row_gets_tenant_and_receipt(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        removed = _payment(
            test_org, test_user, applicant_id=TENANT, attribution_source="auto_exact",
            is_capital_improvement=False, tax_relevant=True,
        )
        kept = _payment(test_org, test_user, description="Zelle from Jane")
        receipt = _receipt(test_org, test_user, removed, "pending")
        db.add_all([removed, kept])
        await db.flush()
        db.add(receipt)
        await db.commit()

        result = await _keep(db, test_org, test_user, kept, [removed])

        assert result == {"kept": 1, "deleted": 1}
        await db.refresh(kept)
        await db.refresh(receipt)
        assert kept.applicant_id == TENANT
        assert kept.attribution_source == "auto_exact"
        assert kept.tax_relevant is True
        assert receipt.transaction_id == kept.id

    @pytest.mark.asyncio
    async def test_two_removed_rows_with_different_tenants_refuse(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        kept = _payment(test_org, test_user)
        first = _payment(test_org, test_user, applicant_id=TENANT)
        second = _payment(test_org, test_user, applicant_id=OTHER_TENANT)
        db.add_all([kept, first, second])
        await db.commit()

        with pytest.raises(MergeConflictError, match="different tenants"):
            await _keep(db, test_org, test_user, kept, [first, second])

        assert kept.applicant_id is None
        assert first.deleted_at is None
        assert second.deleted_at is None


class TestMergeKeepsHandChosenTaxFields:
    @pytest.mark.asyncio
    async def test_tax_year_and_line_kept_when_date_and_category_unchanged(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        removed = _payment(test_org, test_user, transaction_date=date(2025, 1, 3))
        survivor = _payment(
            test_org, test_user, transaction_date=date(2025, 1, 2),
            tax_year=2024, schedule_e_line="line_4_royalties",
        )
        db.add_all([removed, survivor])
        await db.commit()

        result = await _merge(db, test_org, test_user, removed, survivor, survivor)

        assert result.transaction_date == date(2025, 1, 2)
        assert result.tax_year == 2024
        assert result.schedule_e_line == "line_4_royalties"

    @pytest.mark.asyncio
    async def test_hand_chosen_tax_year_kept_when_date_changes(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        removed = _payment(test_org, test_user, transaction_date=date(2025, 1, 2))
        survivor = _payment(
            test_org, test_user, transaction_date=date(2025, 1, 5), tax_year=2024,
        )
        db.add_all([removed, survivor])
        await db.commit()

        result = await _merge(db, test_org, test_user, removed, survivor, survivor)

        assert result.transaction_date == date(2025, 1, 2)
        assert result.tax_year == 2024

    @pytest.mark.asyncio
    async def test_tax_year_follows_a_new_date_across_the_year(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        removed = _payment(test_org, test_user, transaction_date=date(2024, 12, 30))
        survivor = _payment(test_org, test_user, transaction_date=date(2025, 1, 2))
        db.add_all([removed, survivor])
        await db.commit()

        result = await _merge(db, test_org, test_user, removed, survivor, survivor)

        assert result.tax_year == 2024

    @pytest.mark.asyncio
    async def test_line_follows_a_new_category_when_it_was_the_default(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        removed = _payment(test_org, test_user, category="maintenance")
        survivor = _payment(test_org, test_user, category="utilities")
        db.add_all([removed, survivor])
        await db.commit()

        result = await _merge(
            db, test_org, test_user, removed, survivor, survivor,
            DuplicateMergeOverrides(category=DuplicateMergeFieldSource.a),
        )

        assert result.category == "maintenance"
        assert result.schedule_e_line == CATEGORY_TO_SCHEDULE_E["maintenance"]

    @pytest.mark.asyncio
    async def test_hand_chosen_line_kept_when_category_changes(
        self, db: AsyncSession, test_org: Organization, test_user: User,
    ) -> None:
        removed = _payment(test_org, test_user, category="maintenance")
        survivor = _payment(
            test_org, test_user, category="utilities", schedule_e_line="line_19_other",
        )
        db.add_all([removed, survivor])
        await db.commit()

        result = await _merge(
            db, test_org, test_user, removed, survivor, survivor,
            DuplicateMergeOverrides(category=DuplicateMergeFieldSource.a),
        )

        assert result.schedule_e_line == "line_19_other"
