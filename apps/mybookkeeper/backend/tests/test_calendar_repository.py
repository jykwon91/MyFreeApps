"""Repository tests for the unified calendar viewer.

Covers:
- date-range overlap (events fully inside / overlapping start / overlapping end / outside)
- soft-deleted listings excluded
- tenant isolation: another organization's events never appear
- filter composition: listing_ids, property_ids, sources

Per CLAUDE.md: 'enumerate and test all composite key combinations
before implementation' — applied here to the half-open interval
intersection plus filter compositions.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.listing import Listing
from app.models.listings.listing_blackout import ListingBlackout
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.properties.property import Property
from app.models.user.user import User
from app.repositories.calendar import calendar_repository


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_listing(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID,
    title: str = "Master Bedroom",
    deleted_at: datetime | None = None,
) -> Listing:
    return Listing(
        id=uuid.uuid4(),
        organization_id=organization_id,
        user_id=user_id,
        property_id=property_id,
        title=title,
        monthly_rate=Decimal("1500.00"),
        room_type="private_room",
        private_bath=False,
        parking_assigned=False,
        furnished=True,
        status="active",
        amenities=[],
        pets_on_premises=False,
        deleted_at=deleted_at,
    )


async def _seed_property(
    db: AsyncSession, org: Organization, user: User, *, name: str = "House",
) -> Property:
    prop = Property(
        organization_id=org.id,
        user_id=user.id,
        name=name,
        address="100 Med Center Dr",
    )
    db.add(prop)
    await db.flush()
    return prop


def _make_blackout(
    *,
    listing_id: uuid.UUID,
    starts_on: date,
    ends_on: date,
    source: str = "airbnb",
    source_event_id: str | None = None,
) -> ListingBlackout:
    return ListingBlackout(
        listing_id=listing_id,
        starts_on=starts_on,
        ends_on=ends_on,
        source=source,
        source_event_id=source_event_id,
    )


# ---------------------------------------------------------------------------
# Date-range overlap
# ---------------------------------------------------------------------------


class TestCalendarRepoDateOverlap:
    """Half-open interval intersection: event is in [from, to) when
    starts_on < to AND ends_on > from.
    """

    @pytest.mark.asyncio
    async def test_event_fully_inside_window_is_included(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        db.add(_make_blackout(
            listing_id=listing.id,
            starts_on=date(2026, 6, 5),
            ends_on=date(2026, 6, 10),
            source="airbnb",
            source_event_id="uid-inside",
        ))
        await db.commit()

        rows = await calendar_repository.query_events(
            db,
            organization_id=test_org.id,
            from_=date(2026, 6, 1),
            to=date(2026, 7, 1),
        )
        assert len(rows) == 1
        assert rows[0][0].source_event_id == "uid-inside"

    @pytest.mark.asyncio
    async def test_event_overlapping_window_start_is_included(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        # Starts before window, ends inside.
        db.add(_make_blackout(
            listing_id=listing.id,
            starts_on=date(2026, 5, 25),
            ends_on=date(2026, 6, 5),
            source="vrbo",
        ))
        await db.commit()

        rows = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
        )
        assert len(rows) == 1

    @pytest.mark.asyncio
    async def test_event_overlapping_window_end_is_included(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        db.add(_make_blackout(
            listing_id=listing.id,
            starts_on=date(2026, 6, 25),
            ends_on=date(2026, 7, 5),
            source="airbnb",
        ))
        await db.commit()

        rows = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
        )
        assert len(rows) == 1

    @pytest.mark.asyncio
    async def test_event_fully_before_window_is_excluded(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        db.add(_make_blackout(
            listing_id=listing.id,
            starts_on=date(2026, 5, 1),
            ends_on=date(2026, 5, 10),
        ))
        await db.commit()

        rows = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
        )
        assert rows == []

    @pytest.mark.asyncio
    async def test_event_fully_after_window_is_excluded(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        db.add(_make_blackout(
            listing_id=listing.id,
            starts_on=date(2026, 8, 1),
            ends_on=date(2026, 8, 10),
        ))
        await db.commit()

        rows = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
        )
        assert rows == []

    @pytest.mark.asyncio
    async def test_event_touching_window_end_exclusive_is_excluded(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Half-open semantics: an event that starts on ``to`` is OUT."""
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        db.add(_make_blackout(
            listing_id=listing.id,
            starts_on=date(2026, 7, 1),  # equals window 'to'
            ends_on=date(2026, 7, 5),
        ))
        await db.commit()

        rows = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
        )
        assert rows == []

    @pytest.mark.asyncio
    async def test_event_ending_on_window_start_exclusive_is_excluded(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Half-open semantics: an event that ends on ``from`` is OUT
        (because ends_on > from_ would be false)."""
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        db.add(_make_blackout(
            listing_id=listing.id,
            starts_on=date(2026, 5, 28),
            ends_on=date(2026, 6, 1),  # equals window 'from'
        ))
        await db.commit()

        rows = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
        )
        assert rows == []


# ---------------------------------------------------------------------------
# Soft delete
# ---------------------------------------------------------------------------


class TestCalendarRepoSoftDelete:
    @pytest.mark.asyncio
    async def test_soft_deleted_listing_is_excluded(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        active = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="Active",
        )
        gone = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="Gone",
            deleted_at=datetime.now(timezone.utc),
        )
        db.add_all([active, gone])
        await db.flush()
        db.add(_make_blackout(
            listing_id=active.id,
            starts_on=date(2026, 6, 5), ends_on=date(2026, 6, 10),
        ))
        db.add(_make_blackout(
            listing_id=gone.id,
            starts_on=date(2026, 6, 5), ends_on=date(2026, 6, 10),
        ))
        await db.commit()

        rows = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
        )
        assert len(rows) == 1
        assert rows[0][1].title == "Active"


# ---------------------------------------------------------------------------
# Tenant isolation — THE non-negotiable test per the spec
# ---------------------------------------------------------------------------


class TestCalendarRepoTenantIsolation:
    @pytest.mark.asyncio
    async def test_user_b_cannot_see_user_a_blackouts(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """Two orgs, two users, one blackout each. Each org's query returns
        only its own blackouts — even if a malicious caller passes another
        org's listing_id in the filter.
        """
        # Org A — already created by the fixture.
        prop_a = await _seed_property(db, test_org, test_user, name="A House")
        listing_a = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop_a.id,
            title="Org A Listing",
        )
        db.add(listing_a)
        await db.flush()
        db.add(_make_blackout(
            listing_id=listing_a.id,
            starts_on=date(2026, 6, 5), ends_on=date(2026, 6, 10),
            source="airbnb", source_event_id="A-1",
        ))

        # Org B with its own user.
        user_b = User(
            id=uuid.uuid4(),
            email="userb@example.com",
            hashed_password="hash",
            is_active=True, is_superuser=False, is_verified=True,
        )
        org_b = Organization(id=uuid.uuid4(), name="Org B", created_by=user_b.id)
        db.add_all([user_b, org_b])
        await db.flush()
        db.add(OrganizationMember(
            organization_id=org_b.id, user_id=user_b.id, org_role="owner",
        ))
        prop_b = Property(
            organization_id=org_b.id, user_id=user_b.id,
            name="B House", address="200 Other St",
        )
        db.add(prop_b)
        await db.flush()
        listing_b = _make_listing(
            organization_id=org_b.id, user_id=user_b.id, property_id=prop_b.id,
            title="Org B Listing",
        )
        db.add(listing_b)
        await db.flush()
        db.add(_make_blackout(
            listing_id=listing_b.id,
            starts_on=date(2026, 6, 7), ends_on=date(2026, 6, 12),
            source="vrbo", source_event_id="B-1",
        ))
        await db.commit()

        # Org A side
        a_rows = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
        )
        assert {r[0].source_event_id for r in a_rows} == {"A-1"}

        # Org B side
        b_rows = await calendar_repository.query_events(
            db, organization_id=org_b.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
        )
        assert {r[0].source_event_id for r in b_rows} == {"B-1"}

    @pytest.mark.asyncio
    async def test_filter_with_other_orgs_listing_id_returns_nothing(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """The CRITICAL test: passing another org's listing_id in the filter
        must NOT bypass tenant scoping.
        """
        # Org A
        prop_a = await _seed_property(db, test_org, test_user, name="A House")
        listing_a = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop_a.id,
        )
        db.add(listing_a)
        await db.flush()
        db.add(_make_blackout(
            listing_id=listing_a.id,
            starts_on=date(2026, 6, 5), ends_on=date(2026, 6, 10),
        ))

        # Org B
        user_b = User(
            id=uuid.uuid4(), email="b@example.com", hashed_password="hash",
            is_active=True, is_superuser=False, is_verified=True,
        )
        org_b = Organization(id=uuid.uuid4(), name="Org B", created_by=user_b.id)
        db.add_all([user_b, org_b])
        await db.flush()
        prop_b = Property(
            organization_id=org_b.id, user_id=user_b.id,
            name="B", address="2 Other St",
        )
        db.add(prop_b)
        await db.flush()
        listing_b = _make_listing(
            organization_id=org_b.id, user_id=user_b.id, property_id=prop_b.id,
        )
        db.add(listing_b)
        await db.flush()
        db.add(_make_blackout(
            listing_id=listing_b.id,
            starts_on=date(2026, 6, 7), ends_on=date(2026, 6, 12),
        ))
        await db.commit()

        # Org A queries with Org B's listing_id in the filter — should see nothing.
        rows = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
            listing_ids=[listing_b.id],
        )
        assert rows == []


# ---------------------------------------------------------------------------
# Filter composition
# ---------------------------------------------------------------------------


class TestCalendarRepoFilters:
    @pytest.mark.asyncio
    async def test_listing_ids_filter_narrows_to_specific_listings(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        l1 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="L1",
        )
        l2 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="L2",
        )
        db.add_all([l1, l2])
        await db.flush()
        db.add(_make_blackout(
            listing_id=l1.id,
            starts_on=date(2026, 6, 5), ends_on=date(2026, 6, 10),
        ))
        db.add(_make_blackout(
            listing_id=l2.id,
            starts_on=date(2026, 6, 5), ends_on=date(2026, 6, 10),
        ))
        await db.commit()

        rows = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
            listing_ids=[l1.id],
        )
        assert {r[1].title for r in rows} == {"L1"}

    @pytest.mark.asyncio
    async def test_property_ids_filter_narrows_to_specific_properties(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop_a = await _seed_property(db, test_org, test_user, name="A")
        prop_b = await _seed_property(db, test_org, test_user, name="B")
        la = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop_a.id,
            title="La",
        )
        lb = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop_b.id,
            title="Lb",
        )
        db.add_all([la, lb])
        await db.flush()
        db.add(_make_blackout(
            listing_id=la.id, starts_on=date(2026, 6, 5), ends_on=date(2026, 6, 10),
        ))
        db.add(_make_blackout(
            listing_id=lb.id, starts_on=date(2026, 6, 5), ends_on=date(2026, 6, 10),
        ))
        await db.commit()

        rows = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
            property_ids=[prop_a.id],
        )
        assert {r[2].name for r in rows} == {"A"}

    @pytest.mark.asyncio
    async def test_sources_filter_narrows_to_specific_channels(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        db.add(_make_blackout(
            listing_id=listing.id,
            starts_on=date(2026, 6, 5), ends_on=date(2026, 6, 10),
            source="airbnb", source_event_id="ab-1",
        ))
        db.add(_make_blackout(
            listing_id=listing.id,
            starts_on=date(2026, 6, 11), ends_on=date(2026, 6, 14),
            source="vrbo", source_event_id="vr-1",
        ))
        db.add(_make_blackout(
            listing_id=listing.id,
            starts_on=date(2026, 6, 15), ends_on=date(2026, 6, 20),
            source="manual", source_event_id=None,
        ))
        await db.commit()

        # Single source.
        ab_only = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
            sources=["airbnb"],
        )
        assert {r[0].source for r in ab_only} == {"airbnb"}

        # Multiple sources.
        ab_and_manual = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
            sources=["airbnb", "manual"],
        )
        assert {r[0].source for r in ab_and_manual} == {"airbnb", "manual"}

    @pytest.mark.asyncio
    async def test_filters_compose_with_and(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        """listing_ids AND sources both apply — must satisfy both."""
        prop = await _seed_property(db, test_org, test_user)
        l1 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="L1",
        )
        l2 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="L2",
        )
        db.add_all([l1, l2])
        await db.flush()
        # L1 + airbnb (matches both filters)
        db.add(_make_blackout(
            listing_id=l1.id, starts_on=date(2026, 6, 5), ends_on=date(2026, 6, 10),
            source="airbnb", source_event_id="match",
        ))
        # L1 + vrbo (matches listing filter, fails source filter)
        db.add(_make_blackout(
            listing_id=l1.id, starts_on=date(2026, 6, 11), ends_on=date(2026, 6, 14),
            source="vrbo", source_event_id="wrong-source",
        ))
        # L2 + airbnb (fails listing filter)
        db.add(_make_blackout(
            listing_id=l2.id, starts_on=date(2026, 6, 5), ends_on=date(2026, 6, 10),
            source="airbnb", source_event_id="wrong-listing",
        ))
        await db.commit()

        rows = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
            listing_ids=[l1.id], sources=["airbnb"],
        )
        assert {r[0].source_event_id for r in rows} == {"match"}


# ---------------------------------------------------------------------------
# Happy-path integration: 2 properties × 2 listings × multiple blackouts
# ---------------------------------------------------------------------------


class TestCalendarRepoHappyPath:
    @pytest.mark.asyncio
    async def test_two_properties_two_listings_with_blackouts(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop_a = await _seed_property(db, test_org, test_user, name="House A")
        prop_b = await _seed_property(db, test_org, test_user, name="House B")
        l_a1 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop_a.id,
            title="A Room 1",
        )
        l_a2 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop_a.id,
            title="A Room 2",
        )
        l_b1 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop_b.id,
            title="B Room 1",
        )
        l_b2 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop_b.id,
            title="B Room 2",
        )
        db.add_all([l_a1, l_a2, l_b1, l_b2])
        await db.flush()

        # 5 blackouts spread across all 4 listings.
        events = [
            (l_a1.id, date(2026, 6, 5), date(2026, 6, 10), "airbnb"),
            (l_a1.id, date(2026, 6, 15), date(2026, 6, 18), "vrbo"),
            (l_a2.id, date(2026, 6, 8), date(2026, 6, 12), "airbnb"),
            (l_b1.id, date(2026, 6, 20), date(2026, 6, 25), "manual"),
            (l_b2.id, date(2026, 6, 1), date(2026, 6, 4), "airbnb"),
        ]
        for listing_id, starts, ends, src in events:
            db.add(_make_blackout(
                listing_id=listing_id, starts_on=starts, ends_on=ends, source=src,
                source_event_id=f"uid-{listing_id}-{starts.isoformat()}",
            ))
        await db.commit()

        rows = await calendar_repository.query_events(
            db, organization_id=test_org.id,
            from_=date(2026, 6, 1), to=date(2026, 7, 1),
        )
        assert len(rows) == 5

        # Ordering: by property name, then listing title, then starts_on.
        property_titles = [(r[2].name, r[1].title, r[0].starts_on) for r in rows]
        assert property_titles == sorted(property_titles)

        # Each row carries the right listing + property metadata.
        for blackout, listing, prop in rows:
            assert listing.id == blackout.listing_id
            assert prop.id == listing.property_id
