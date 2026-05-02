import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization_member import OrgRole
from app.models.user.user import Role, User
from app.repositories.user import user_repo


@pytest_asyncio.fixture()
async def regular_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="regular@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        role=Role.USER,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def admin_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="admin@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        role=Role.ADMIN,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield db

    @asynccontextmanager
    async def _fake_session_local():
        yield db

    # Patch every entry point that opens a DB session so the routes — and the
    # services they delegate to (inquiry_service.create_inquiry / .get_inquiry
    # etc.) — see the test in-memory SQLite session.
    with (
        patch("app.api.test_utils.unit_of_work", _fake_uow),
        patch("app.services.inquiries.inquiry_service.unit_of_work", _fake_uow),
        patch(
            "app.services.inquiries.inquiry_service.AsyncSessionLocal",
            _fake_session_local,
        ),
    ):
        yield


class TestPromoteToAdmin:
    @pytest.mark.asyncio
    async def test_promote_regular_user_to_admin(
        self, db: AsyncSession, regular_user: User,
    ) -> None:
        assert regular_user.role == Role.USER

        await user_repo.update_role(db, regular_user, Role.ADMIN)
        await db.commit()
        await db.refresh(regular_user)

        assert regular_user.role == Role.ADMIN

    @pytest.mark.asyncio
    async def test_already_admin_is_noop(
        self, db: AsyncSession, admin_user: User,
    ) -> None:
        assert admin_user.role == Role.ADMIN
        await user_repo.update_role(db, admin_user, Role.ADMIN)
        assert admin_user.role == Role.ADMIN

    @pytest.mark.asyncio
    async def test_endpoint_gated_by_env_var(self) -> None:
        """The endpoint returns 404 when allow_test_admin_promotion is False."""
        from app.api.test_utils import promote_to_admin
        from app.core.config import settings
        from fastapi import HTTPException

        original = settings.allow_test_admin_promotion
        try:
            settings.allow_test_admin_promotion = False
            fake_user = User(
                id=uuid.uuid4(),
                email="test@example.com",
                hashed_password="fakehash",
                is_active=True,
                is_superuser=False,
                is_verified=True,
                role=Role.USER,
            )
            with pytest.raises(HTTPException) as exc_info:
                await promote_to_admin(user=fake_user)
            assert exc_info.value.status_code == 404
        finally:
            settings.allow_test_admin_promotion = original

    @pytest.mark.asyncio
    async def test_endpoint_promotes_when_enabled(
        self, db: AsyncSession, regular_user: User,
    ) -> None:
        from app.api.test_utils import promote_to_admin
        from app.core.config import settings

        original = settings.allow_test_admin_promotion
        try:
            settings.allow_test_admin_promotion = True
            result = await promote_to_admin(user=regular_user)
            assert result.role == Role.ADMIN
        finally:
            settings.allow_test_admin_promotion = original

    @pytest.mark.asyncio
    async def test_endpoint_returns_admin_user_unchanged(
        self, db: AsyncSession, admin_user: User,
    ) -> None:
        from app.api.test_utils import promote_to_admin
        from app.core.config import settings

        original = settings.allow_test_admin_promotion
        try:
            settings.allow_test_admin_promotion = True
            result = await promote_to_admin(user=admin_user)
            assert result.role == Role.ADMIN
        finally:
            settings.allow_test_admin_promotion = original


class TestSeedInquiry:
    """Coverage for the test-only POST /test/seed-inquiry endpoint."""

    @pytest.mark.asyncio
    async def test_endpoint_gated_by_env_var(
        self, db: AsyncSession, regular_user: User,
    ) -> None:
        import datetime as _dt
        from app.api.test_utils import seed_inquiry
        from app.core.config import settings
        from app.core.context import RequestContext
        from app.schemas.inquiries.inquiry_create_request import InquiryCreateRequest
        from fastapi import HTTPException

        ctx = RequestContext(
            user_id=regular_user.id,
            organization_id=uuid.uuid4(),
            org_role=OrgRole.OWNER,
        )
        payload = InquiryCreateRequest(
            source="direct",
            received_at=_dt.datetime.now(_dt.timezone.utc),
        )
        original = settings.allow_test_admin_promotion
        try:
            settings.allow_test_admin_promotion = False
            with pytest.raises(HTTPException) as exc_info:
                await seed_inquiry(payload=payload, ctx=ctx)
            assert exc_info.value.status_code == 404
        finally:
            settings.allow_test_admin_promotion = original

    @pytest.mark.asyncio
    async def test_creates_an_inquiry_when_enabled(
        self,
        db: AsyncSession,
        test_org,
        test_user: User,
    ) -> None:
        import datetime as _dt
        from app.api.test_utils import seed_inquiry
        from app.core.config import settings
        from app.core.context import RequestContext
        from app.schemas.inquiries.inquiry_create_request import InquiryCreateRequest

        ctx = RequestContext(
            user_id=test_user.id,
            organization_id=test_org.id,
            org_role=OrgRole.OWNER,
        )
        payload = InquiryCreateRequest(
            source="direct",
            inquirer_name="Test Nurse",
            received_at=_dt.datetime.now(_dt.timezone.utc),
        )
        original = settings.allow_test_admin_promotion
        try:
            settings.allow_test_admin_promotion = True
            result = await seed_inquiry(payload=payload, ctx=ctx)
            assert result.source == "direct"
            assert result.inquirer_name == "Test Nurse"
            assert result.stage == "new"
        finally:
            settings.allow_test_admin_promotion = original


class TestDeleteInquiry:
    """Coverage for the test-only DELETE /test/inquiries/{id} endpoint."""

    @pytest.mark.asyncio
    async def test_endpoint_gated_by_env_var(self) -> None:
        from app.api.test_utils import delete_inquiry
        from app.core.config import settings
        from app.core.context import RequestContext
        from fastapi import HTTPException

        ctx = RequestContext(
            user_id=uuid.uuid4(),
            organization_id=uuid.uuid4(),
            org_role=OrgRole.OWNER,
        )
        original = settings.allow_test_admin_promotion
        try:
            settings.allow_test_admin_promotion = False
            with pytest.raises(HTTPException) as exc_info:
                await delete_inquiry(inquiry_id=uuid.uuid4(), ctx=ctx)
            assert exc_info.value.status_code == 404
        finally:
            settings.allow_test_admin_promotion = original

    @pytest.mark.asyncio
    async def test_hard_deletes_an_inquiry_when_enabled(
        self,
        db: AsyncSession,
        test_org,
        test_user: User,
    ) -> None:
        import datetime as _dt
        from app.api.test_utils import delete_inquiry, seed_inquiry
        from app.core.config import settings
        from app.core.context import RequestContext
        from app.repositories import inquiry_repo
        from app.schemas.inquiries.inquiry_create_request import InquiryCreateRequest

        ctx = RequestContext(
            user_id=test_user.id,
            organization_id=test_org.id,
            org_role=OrgRole.OWNER,
        )
        payload = InquiryCreateRequest(
            source="direct",
            inquirer_name="To Be Deleted",
            received_at=_dt.datetime.now(_dt.timezone.utc),
        )
        original = settings.allow_test_admin_promotion
        try:
            settings.allow_test_admin_promotion = True
            created = await seed_inquiry(payload=payload, ctx=ctx)

            # Sanity: the row is visible to the get path.
            existing = await inquiry_repo.get_by_id(db, created.id, test_org.id)
            assert existing is not None

            await delete_inquiry(inquiry_id=created.id, ctx=ctx)

            # After hard-delete, the row should be gone (NOT just soft-deleted).
            gone = await inquiry_repo.get_by_id(db, created.id, test_org.id)
            assert gone is None
        finally:
            settings.allow_test_admin_promotion = original


class TestSeedBlackout:
    """Coverage for the test-only POST /test/seed-blackout endpoint
    (used by the unified-calendar E2E)."""

    @pytest.mark.asyncio
    async def test_seed_then_delete_round_trip(
        self,
        db: AsyncSession,
        test_org,
        test_user: User,
    ) -> None:
        import datetime as _dt
        from decimal import Decimal
        from app.api.test_utils import (
            _SeedBlackoutRequest,
            delete_blackout,
            seed_blackout,
        )
        from app.core.config import settings
        from app.core.context import RequestContext
        from app.models.listings.listing import Listing
        from app.models.listings.listing_blackout import ListingBlackout
        from app.models.properties.property import Property
        from sqlalchemy import select

        # Seed property + listing first.
        prop = Property(
            organization_id=test_org.id, user_id=test_user.id,
            name="Calendar Seed Test House", address="100 Test St",
        )
        db.add(prop)
        await db.flush()
        listing = Listing(
            organization_id=test_org.id, user_id=test_user.id,
            property_id=prop.id, title="Seed Room",
            monthly_rate=Decimal("1500.00"), room_type="private_room",
            private_bath=False, parking_assigned=False, furnished=True,
            status="active", amenities=[], pets_on_premises=False,
        )
        db.add(listing)
        await db.commit()

        ctx = RequestContext(
            user_id=test_user.id,
            organization_id=test_org.id,
            org_role=OrgRole.OWNER,
        )
        original = settings.allow_test_admin_promotion
        try:
            settings.allow_test_admin_promotion = True
            payload = _SeedBlackoutRequest(
                listing_id=listing.id,
                starts_on=_dt.date(2026, 6, 5),
                ends_on=_dt.date(2026, 6, 10),
                source="airbnb",
                source_event_id="seed-test-1",
            )
            created = await seed_blackout(payload=payload, ctx=ctx)

            row = await db.execute(
                select(ListingBlackout).where(ListingBlackout.id == created.id),
            )
            assert row.scalar_one_or_none() is not None

            await delete_blackout(blackout_id=created.id, ctx=ctx)
            row = await db.execute(
                select(ListingBlackout).where(ListingBlackout.id == created.id),
            )
            assert row.scalar_one_or_none() is None
        finally:
            settings.allow_test_admin_promotion = original

    @pytest.mark.asyncio
    async def test_seed_rejects_listing_in_other_org(
        self,
        db: AsyncSession,
        test_org,
        test_user: User,
    ) -> None:
        """A caller cannot seed a blackout under another org's listing."""
        import datetime as _dt
        from decimal import Decimal
        from fastapi import HTTPException
        from app.api.test_utils import _SeedBlackoutRequest, seed_blackout
        from app.core.config import settings
        from app.core.context import RequestContext
        from app.models.listings.listing import Listing
        from app.models.organization.organization import Organization
        from app.models.properties.property import Property

        # Create a separate org's listing.
        other_user = User(
            id=uuid.uuid4(), email="other@example.com",
            hashed_password="hash", is_active=True,
            is_superuser=False, is_verified=True,
        )
        other_org = Organization(
            id=uuid.uuid4(), name="Other", created_by=other_user.id,
        )
        db.add_all([other_user, other_org])
        await db.flush()
        other_prop = Property(
            organization_id=other_org.id, user_id=other_user.id,
            name="Other House", address="2 Other St",
        )
        db.add(other_prop)
        await db.flush()
        other_listing = Listing(
            organization_id=other_org.id, user_id=other_user.id,
            property_id=other_prop.id, title="Other Room",
            monthly_rate=Decimal("1500.00"), room_type="private_room",
            private_bath=False, parking_assigned=False, furnished=True,
            status="active", amenities=[], pets_on_premises=False,
        )
        db.add(other_listing)
        await db.commit()

        ctx = RequestContext(
            user_id=test_user.id,
            organization_id=test_org.id,
            org_role=OrgRole.OWNER,
        )
        original = settings.allow_test_admin_promotion
        try:
            settings.allow_test_admin_promotion = True
            payload = _SeedBlackoutRequest(
                listing_id=other_listing.id,
                starts_on=_dt.date(2026, 6, 5),
                ends_on=_dt.date(2026, 6, 10),
                source="airbnb",
            )
            with pytest.raises(HTTPException) as exc_info:
                await seed_blackout(payload=payload, ctx=ctx)
            assert exc_info.value.status_code == 404
        finally:
            settings.allow_test_admin_promotion = original
