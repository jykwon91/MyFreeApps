"""Every write that can move a computed tax-return total marks unfiled returns out of date.

A row counts towards Schedule E / Schedule C when it is live, approved and tax-relevant
(``app.core.tax_total_inputs``). These tests walk each write path and check that an unfiled
return gets ``needs_recompute=True``, a filed return is never touched, and writes that can't
move a total leave the flag alone.
"""
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.applicants.applicant import Applicant
from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories import transaction_repo
from app.schemas.transactions.duplicate import DuplicateMergeOverrides
from app.services.classification import rule_learning_service
from app.services.extraction.dedup_resolution_service import resolve_and_link
from app.services.extraction.dedup_service import DedupDecision
from app.services.transactions import attribution_service, transaction_service

_SERVICE = "app.services.transactions.transaction_service"


def _ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(organization_id=org.id, user_id=user.id, org_role="owner")


def _session_factory(db: AsyncSession) -> Callable[[], AbstractAsyncContextManager[AsyncSession]]:
    @asynccontextmanager
    async def _fake() -> AsyncIterator[AsyncSession]:
        yield db

    return _fake


def _txn(
    org: Organization,
    user: User,
    *,
    status: str = "approved",
    tax_relevant: bool = True,
    property_id: uuid.UUID | None = None,
    vendor: str = "Ace Plumbing",
    category: str = "maintenance",
    transaction_type: str = "expense",
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        property_id=property_id,
        transaction_date=date(2025, 6, 15),
        tax_year=2025,
        vendor=vendor,
        amount=Decimal("100.00"),
        transaction_type=transaction_type,
        category=category,
        schedule_e_line="line_7_cleaning_maintenance",
        status=status,
        tax_relevant=tax_relevant,
    )


async def _seed_txn(db: AsyncSession, txn: Transaction) -> Transaction:
    """Insert without going through ``transaction_repo.create``, which itself flags."""
    db.add(txn)
    await db.commit()
    return txn


async def _seed_returns(db: AsyncSession, org: Organization) -> tuple[TaxReturn, TaxReturn]:
    draft = TaxReturn(organization_id=org.id, tax_year=2025, needs_recompute=False)
    filed = TaxReturn(organization_id=org.id, tax_year=2024, status="filed", needs_recompute=False)
    db.add_all([draft, filed])
    await db.commit()
    return draft, filed


async def _seed_property(db: AsyncSession, org: Organization, user: User) -> Property:
    prop = Property(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        name="Duplex", type=PropertyType.LONG_TERM,
    )
    db.add(prop)
    await db.commit()
    return prop


async def _assert_flagged(db: AsyncSession, draft: TaxReturn, filed: TaxReturn, *, flagged: bool) -> None:
    await db.refresh(draft)
    await db.refresh(filed)
    assert draft.needs_recompute is flagged
    assert filed.needs_recompute is False


async def _update(db: AsyncSession, ctx: RequestContext, txn_id: uuid.UUID, updates: dict[str, object]) -> None:
    with patch(f"{_SERVICE}.unit_of_work", _session_factory(db)), \
            patch.object(rule_learning_service, "record_event", AsyncMock()):
        result = await transaction_service.update_transaction(ctx, txn_id, updates)
    assert result is not None


class TestDelete:
    @pytest.mark.asyncio
    async def test_deleting_a_counted_row_flags(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        txn = await _seed_txn(db, _txn(test_org, test_user))
        draft, filed = await _seed_returns(db, test_org)

        with patch(f"{_SERVICE}.unit_of_work", _session_factory(db)):
            assert await transaction_service.delete_transaction(_ctx(test_org, test_user), txn.id)

        await _assert_flagged(db, draft, filed, flagged=True)

    @pytest.mark.asyncio
    async def test_deleting_a_pending_row_does_not_flag(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        txn = await _seed_txn(db, _txn(test_org, test_user, status="pending"))
        draft, filed = await _seed_returns(db, test_org)

        with patch(f"{_SERVICE}.unit_of_work", _session_factory(db)):
            assert await transaction_service.delete_transaction(_ctx(test_org, test_user), txn.id)

        await _assert_flagged(db, draft, filed, flagged=False)

    @pytest.mark.asyncio
    async def test_bulk_delete_flags(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        counted = await _seed_txn(db, _txn(test_org, test_user))
        pending = await _seed_txn(db, _txn(test_org, test_user, status="pending"))
        draft, filed = await _seed_returns(db, test_org)

        with patch(f"{_SERVICE}.unit_of_work", _session_factory(db)):
            result = await transaction_service.bulk_delete(
                _ctx(test_org, test_user), [counted.id, pending.id],
            )

        assert result["deleted"] == 2
        await _assert_flagged(db, draft, filed, flagged=True)

    @pytest.mark.asyncio
    async def test_keeping_one_duplicate_flags_when_a_deleted_one_counted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        keep = await _seed_txn(db, _txn(test_org, test_user, status="pending"))
        dupe = await _seed_txn(db, _txn(test_org, test_user))
        draft, filed = await _seed_returns(db, test_org)

        with patch(f"{_SERVICE}.unit_of_work", _session_factory(db)):
            await transaction_service.keep_transaction(_ctx(test_org, test_user), keep.id, [dupe.id])

        await _assert_flagged(db, draft, filed, flagged=True)

    @pytest.mark.asyncio
    async def test_hard_delete_for_re_extract_flags_when_a_row_counted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        extraction_id = uuid.uuid4()
        txn = _txn(test_org, test_user)
        txn.extraction_id = extraction_id
        await _seed_txn(db, txn)
        draft, filed = await _seed_returns(db, test_org)

        deleted = await transaction_repo.delete_by_extraction_ids(db, [extraction_id], test_org.id)
        await db.commit()

        assert deleted == 1
        await _assert_flagged(db, draft, filed, flagged=True)


class TestApprove:
    @pytest.mark.asyncio
    async def test_approving_a_tax_relevant_row_flags(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        txn = await _seed_txn(db, _txn(test_org, test_user, status="pending"))
        draft, filed = await _seed_returns(db, test_org)

        await _update(db, _ctx(test_org, test_user), txn.id, {"status": "approved"})

        await _assert_flagged(db, draft, filed, flagged=True)

    @pytest.mark.asyncio
    async def test_bulk_approve_flags(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        txn = await _seed_txn(db, _txn(test_org, test_user, status="pending", property_id=prop.id))
        draft, filed = await _seed_returns(db, test_org)

        with patch(f"{_SERVICE}.unit_of_work", _session_factory(db)):
            result = await transaction_service.bulk_approve(_ctx(test_org, test_user), [txn.id])

        assert result["approved"] == 1
        await _assert_flagged(db, draft, filed, flagged=True)

    @pytest.mark.asyncio
    async def test_bulk_approving_rows_that_are_not_tax_relevant_does_not_flag(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        txn = await _seed_txn(db, _txn(
            test_org, test_user, status="pending", tax_relevant=False, property_id=prop.id,
        ))
        draft, filed = await _seed_returns(db, test_org)

        with patch(f"{_SERVICE}.unit_of_work", _session_factory(db)):
            result = await transaction_service.bulk_approve(_ctx(test_org, test_user), [txn.id])

        assert result["approved"] == 1
        await _assert_flagged(db, draft, filed, flagged=False)


class TestEdit:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("updates", [
        {"amount": Decimal("250.00")},
        {"tax_year": 2024},
        {"status": "needs_review"},
        {"tax_relevant": False},
    ])
    async def test_editing_a_summed_field_flags(
        self, db: AsyncSession, test_user: User, test_org: Organization, updates: dict[str, object],
    ) -> None:
        txn = await _seed_txn(db, _txn(test_org, test_user))
        draft, filed = await _seed_returns(db, test_org)

        await _update(db, _ctx(test_org, test_user), txn.id, updates)

        await _assert_flagged(db, draft, filed, flagged=True)

    @pytest.mark.asyncio
    async def test_moving_a_row_to_another_property_flags(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        txn = await _seed_txn(db, _txn(test_org, test_user))
        draft, filed = await _seed_returns(db, test_org)

        await _update(db, _ctx(test_org, test_user), txn.id, {"property_id": prop.id})

        await _assert_flagged(db, draft, filed, flagged=True)

    @pytest.mark.asyncio
    @pytest.mark.parametrize("updates", [
        {"description": "Kitchen sink, paid by check"},
        {"tags": ["kitchen"]},
        {"transaction_date": date(2025, 7, 1)},
    ])
    async def test_editing_a_field_no_total_reads_does_not_flag(
        self, db: AsyncSession, test_user: User, test_org: Organization, updates: dict[str, object],
    ) -> None:
        txn = await _seed_txn(db, _txn(test_org, test_user))
        draft, filed = await _seed_returns(db, test_org)

        await _update(db, _ctx(test_org, test_user), txn.id, updates)

        await _assert_flagged(db, draft, filed, flagged=False)

    @pytest.mark.asyncio
    async def test_editing_the_amount_of_a_pending_row_does_not_flag(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        txn = await _seed_txn(db, _txn(test_org, test_user, status="pending"))
        draft, filed = await _seed_returns(db, test_org)

        await _update(db, _ctx(test_org, test_user), txn.id, {"amount": Decimal("250.00")})

        await _assert_flagged(db, draft, filed, flagged=False)

    @pytest.mark.asyncio
    async def test_a_category_correction_that_sweeps_a_counted_row_flags(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        # The edited row is pending, so only the retroactive sweep of the
        # vendor's approved row can move a total.
        edited = await _seed_txn(db, _txn(test_org, test_user, status="pending"))
        await _seed_txn(db, _txn(test_org, test_user))
        draft, filed = await _seed_returns(db, test_org)

        await _update(db, _ctx(test_org, test_user), edited.id, {"category": "insurance"})

        await _assert_flagged(db, draft, filed, flagged=True)


class TestMerge:
    @pytest.mark.asyncio
    async def test_merging_into_an_approved_survivor_flags(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        a = await _seed_txn(db, _txn(test_org, test_user, status="pending"))
        b = await _seed_txn(db, _txn(test_org, test_user, status="pending"))
        draft, filed = await _seed_returns(db, test_org)

        with patch(f"{_SERVICE}.unit_of_work", _session_factory(db)):
            survivor = await transaction_service.merge_transactions(
                _ctx(test_org, test_user), a.id, b.id, a.id, DuplicateMergeOverrides(),
            )

        assert survivor.status == "approved"
        await _assert_flagged(db, draft, filed, flagged=True)


class TestCreate:
    @pytest.mark.asyncio
    async def test_creating_a_counted_row_flags(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        # Bank CSV import and extraction both land rows through transaction_repo.create.
        draft, filed = await _seed_returns(db, test_org)

        await transaction_repo.create(db, _txn(test_org, test_user))
        await db.commit()

        await _assert_flagged(db, draft, filed, flagged=True)

    @pytest.mark.asyncio
    async def test_creating_a_pending_row_does_not_flag(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        draft, filed = await _seed_returns(db, test_org)

        await transaction_repo.create(db, _txn(test_org, test_user, status="pending"))
        await db.commit()

        await _assert_flagged(db, draft, filed, flagged=False)

    @pytest.mark.asyncio
    async def test_a_dedup_replace_of_a_counted_row_flags(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        existing = await _seed_txn(db, _txn(test_org, test_user))
        draft, filed = await _seed_returns(db, test_org)
        decision = DedupDecision(action="replace", existing_transaction=existing, reason="better source")

        await resolve_and_link(db, decision, _txn(test_org, test_user, status="needs_review"), uuid.uuid4())
        await db.commit()

        await _assert_flagged(db, draft, filed, flagged=True)


class TestAttribution:
    @pytest.mark.asyncio
    async def test_linking_a_payment_to_a_tenant_flags(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        applicant = Applicant(
            id=uuid.uuid4(), organization_id=test_org.id, user_id=test_user.id,
            stage="lease_signed", legal_name="Jane Doe",
        )
        db.add(applicant)
        txn = await _seed_txn(db, _txn(
            test_org, test_user, status="unverified", vendor="Zelle",
            category="uncategorized", transaction_type="income",
        ))
        draft, filed = await _seed_returns(db, test_org)

        with patch("app.services.transactions.attribution_service.unit_of_work", _session_factory(db)), \
                patch(
                    "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
                    new_callable=AsyncMock,
                ):
            await attribution_service.attribute_manually(
                transaction_id=txn.id, applicant_id=applicant.id,
                organization_id=test_org.id, user_id=test_user.id,
            )

        await _assert_flagged(db, draft, filed, flagged=True)
