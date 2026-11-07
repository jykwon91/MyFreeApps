"""The test-only delete routes report a miss as 404, so an E2E cleanup that
deletes nothing fails loudly instead of leaving rows behind."""
import datetime as dt
import uuid
from collections.abc import Awaitable, Callable, Iterator
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.core.config import settings
from app.core.context import RequestContext
from app.models.applicants.screening_result import ScreeningResult
from app.models.calendar.calendar_email_review_queue import CalendarEmailReviewQueue
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.transactions.rent_attribution_review_queue import RentAttributionReviewQueue
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.test_helpers.rent_seed import (
    _SeedTenantPaymentsRequest,
    delete_tenant_payment,
    seed_tenant_payments,
)
from app.test_helpers.seed import (
    _SeedApplicantRequest,
    _SeedAttributionReviewRequest,
    _SeedReviewQueueRequest,
    delete_screening_result,
    hard_delete_attribution_review,
    hard_delete_review_queue_item,
    seed_applicant,
    seed_attribution_review,
    seed_review_queue_item,
)

Delete = Callable[[uuid.UUID, RequestContext], Awaitable[None]]


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with (
        patch("app.test_helpers.seed.unit_of_work", _fake_uow),
        patch("app.test_helpers.rent_seed.unit_of_work", _fake_uow),
    ):
        yield


@pytest.fixture(autouse=True)
def _test_mode() -> Iterator[None]:
    original = settings.allow_test_admin_promotion
    settings.allow_test_admin_promotion = True
    try:
        yield
    finally:
        settings.allow_test_admin_promotion = original


@pytest.fixture()
def ctx(test_org: Organization, test_user: User) -> RequestContext:
    return RequestContext(user_id=test_user.id, organization_id=test_org.id, org_role=OrgRole.OWNER)


async def _exists(db: AsyncSession, column: InstrumentedAttribute[uuid.UUID], row_id: uuid.UUID) -> bool:
    row = await db.execute(select(column).where(column == row_id))
    return row.scalar_one_or_none() is not None


async def _expect_404(delete: Delete, row_id: uuid.UUID, ctx: RequestContext) -> None:
    with pytest.raises(HTTPException) as exc:
        await delete(row_id, ctx)
    assert exc.value.status_code == 404


def _outsider(ctx: RequestContext) -> RequestContext:
    return RequestContext(user_id=ctx.user_id, organization_id=uuid.uuid4(), org_role=OrgRole.OWNER)


async def _screening(db: AsyncSession, ctx: RequestContext) -> uuid.UUID:
    applicant = await seed_applicant(
        payload=_SeedApplicantRequest(legal_name="Screened Tenant", seed_screening=True), ctx=ctx,
    )
    row = await db.execute(
        select(ScreeningResult.id).where(ScreeningResult.applicant_id == applicant.id)
    )
    return row.scalar_one()


async def _delete_screening(row_id: uuid.UUID, ctx: RequestContext) -> None:
    await delete_screening_result(screening_id=row_id, ctx=ctx)


class TestDeleteScreeningResult:
    @pytest.mark.asyncio
    async def test_deletes_my_screening(self, db: AsyncSession, ctx: RequestContext) -> None:
        screening_id = await _screening(db, ctx)

        await _delete_screening(screening_id, ctx)

        assert not await _exists(db, ScreeningResult.id, screening_id)

    @pytest.mark.asyncio
    async def test_a_missing_screening_is_404(self, ctx: RequestContext) -> None:
        await _expect_404(_delete_screening, uuid.uuid4(), ctx)

    @pytest.mark.asyncio
    async def test_a_screening_deleted_twice_is_404(self, db: AsyncSession, ctx: RequestContext) -> None:
        screening_id = await _screening(db, ctx)
        await _delete_screening(screening_id, ctx)

        await _expect_404(_delete_screening, screening_id, ctx)

    @pytest.mark.asyncio
    async def test_another_organizations_screening_is_404_and_kept(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        screening_id = await _screening(db, ctx)

        await _expect_404(_delete_screening, screening_id, _outsider(ctx))

        assert await _exists(db, ScreeningResult.id, screening_id)

    @pytest.mark.asyncio
    async def test_another_members_screening_is_404_and_kept(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        screening_id = await _screening(db, ctx)
        other_member = RequestContext(
            user_id=uuid.uuid4(), organization_id=ctx.organization_id, org_role=OrgRole.OWNER,
        )

        await _expect_404(_delete_screening, screening_id, other_member)

        assert await _exists(db, ScreeningResult.id, screening_id)

    @pytest.mark.asyncio
    async def test_outside_test_mode_is_404_and_kept(self, db: AsyncSession, ctx: RequestContext) -> None:
        screening_id = await _screening(db, ctx)
        settings.allow_test_admin_promotion = False

        await _expect_404(_delete_screening, screening_id, ctx)

        assert await _exists(db, ScreeningResult.id, screening_id)


async def _review_item(ctx: RequestContext) -> uuid.UUID:
    created = await seed_review_queue_item(
        payload=_SeedReviewQueueRequest(
            email_message_id=f"cleanup-{uuid.uuid4()}", check_in="2026-06-01", check_out="2026-06-05",
        ),
        ctx=ctx,
    )
    return created.id


async def _delete_review_item(row_id: uuid.UUID, ctx: RequestContext) -> None:
    await hard_delete_review_queue_item(item_id=row_id, ctx=ctx)


class TestSeedReviewQueueItem:
    @pytest.mark.asyncio
    async def test_seeding_the_same_message_twice_returns_the_same_item(
        self, ctx: RequestContext,
    ) -> None:
        payload = _SeedReviewQueueRequest(
            email_message_id=f"twice-{uuid.uuid4()}", check_in="2026-06-01", check_out="2026-06-05",
        )

        first = await seed_review_queue_item(payload=payload, ctx=ctx)
        second = await seed_review_queue_item(payload=payload, ctx=ctx)

        assert second.id == first.id
        await _delete_review_item(first.id, ctx)


class TestDeleteReviewQueueItem:
    @pytest.mark.asyncio
    async def test_deletes_my_item(self, db: AsyncSession, ctx: RequestContext) -> None:
        item_id = await _review_item(ctx)

        await _delete_review_item(item_id, ctx)

        assert not await _exists(db, CalendarEmailReviewQueue.id, item_id)

    @pytest.mark.asyncio
    async def test_a_missing_item_is_404(self, ctx: RequestContext) -> None:
        await _expect_404(_delete_review_item, uuid.uuid4(), ctx)

    @pytest.mark.asyncio
    async def test_an_item_deleted_twice_is_404(self, ctx: RequestContext) -> None:
        item_id = await _review_item(ctx)
        await _delete_review_item(item_id, ctx)

        await _expect_404(_delete_review_item, item_id, ctx)

    @pytest.mark.asyncio
    async def test_another_organizations_item_is_404_and_kept(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        item_id = await _review_item(ctx)

        await _expect_404(_delete_review_item, item_id, _outsider(ctx))

        assert await _exists(db, CalendarEmailReviewQueue.id, item_id)

    @pytest.mark.asyncio
    async def test_outside_test_mode_is_404_and_kept(self, db: AsyncSession, ctx: RequestContext) -> None:
        item_id = await _review_item(ctx)
        settings.allow_test_admin_promotion = False

        await _expect_404(_delete_review_item, item_id, ctx)

        assert await _exists(db, CalendarEmailReviewQueue.id, item_id)


async def _attribution_review(ctx: RequestContext) -> tuple[uuid.UUID, uuid.UUID]:
    created = await seed_attribution_review(payload=_SeedAttributionReviewRequest(), ctx=ctx)
    return created.id, created.transaction_id


async def _delete_attribution_review(row_id: uuid.UUID, ctx: RequestContext) -> None:
    await hard_delete_attribution_review(review_id=row_id, ctx=ctx)


class TestDeleteAttributionReview:
    @pytest.mark.asyncio
    async def test_deletes_the_review_and_its_transaction(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        review_id, transaction_id = await _attribution_review(ctx)

        await _delete_attribution_review(review_id, ctx)

        assert not await _exists(db, RentAttributionReviewQueue.id, review_id)
        assert not await _exists(db, Transaction.id, transaction_id)

    @pytest.mark.asyncio
    async def test_a_missing_review_is_404(self, ctx: RequestContext) -> None:
        await _expect_404(_delete_attribution_review, uuid.uuid4(), ctx)

    @pytest.mark.asyncio
    async def test_a_review_deleted_twice_is_404(self, ctx: RequestContext) -> None:
        review_id, _ = await _attribution_review(ctx)
        await _delete_attribution_review(review_id, ctx)

        await _expect_404(_delete_attribution_review, review_id, ctx)

    @pytest.mark.asyncio
    async def test_another_organizations_review_is_404_and_kept_with_its_transaction(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        review_id, transaction_id = await _attribution_review(ctx)

        await _expect_404(_delete_attribution_review, review_id, _outsider(ctx))

        assert await _exists(db, RentAttributionReviewQueue.id, review_id)
        assert await _exists(db, Transaction.id, transaction_id)

    @pytest.mark.asyncio
    async def test_outside_test_mode_is_404_and_kept(self, db: AsyncSession, ctx: RequestContext) -> None:
        review_id, transaction_id = await _attribution_review(ctx)
        settings.allow_test_admin_promotion = False

        await _expect_404(_delete_attribution_review, review_id, ctx)

        assert await _exists(db, RentAttributionReviewQueue.id, review_id)
        assert await _exists(db, Transaction.id, transaction_id)


async def _payment(ctx: RequestContext) -> uuid.UUID:
    applicant = await seed_applicant(payload=_SeedApplicantRequest(legal_name="Paying Tenant"), ctx=ctx)
    created = await seed_tenant_payments(
        payload=_SeedTenantPaymentsRequest(applicant_id=applicant.id, paid_on=[dt.date(2026, 6, 1)]),
        ctx=ctx,
    )
    return created.transaction_ids[0]


async def _delete_payment(row_id: uuid.UUID, ctx: RequestContext) -> None:
    await delete_tenant_payment(transaction_id=row_id, ctx=ctx)


class TestDeleteTenantPayment:
    @pytest.mark.asyncio
    async def test_deletes_my_payment(self, db: AsyncSession, ctx: RequestContext) -> None:
        transaction_id = await _payment(ctx)

        await _delete_payment(transaction_id, ctx)

        assert not await _exists(db, Transaction.id, transaction_id)

    @pytest.mark.asyncio
    async def test_a_missing_payment_is_404(self, ctx: RequestContext) -> None:
        await _expect_404(_delete_payment, uuid.uuid4(), ctx)

    @pytest.mark.asyncio
    async def test_a_payment_deleted_twice_is_404(self, ctx: RequestContext) -> None:
        transaction_id = await _payment(ctx)
        await _delete_payment(transaction_id, ctx)

        await _expect_404(_delete_payment, transaction_id, ctx)

    @pytest.mark.asyncio
    async def test_another_organizations_payment_is_404_and_kept(
        self, db: AsyncSession, ctx: RequestContext,
    ) -> None:
        transaction_id = await _payment(ctx)

        await _expect_404(_delete_payment, transaction_id, _outsider(ctx))

        assert await _exists(db, Transaction.id, transaction_id)

    @pytest.mark.asyncio
    async def test_outside_test_mode_is_404_and_kept(self, db: AsyncSession, ctx: RequestContext) -> None:
        transaction_id = await _payment(ctx)
        settings.allow_test_admin_promotion = False

        await _expect_404(_delete_payment, transaction_id, ctx)

        assert await _exists(db, Transaction.id, transaction_id)
