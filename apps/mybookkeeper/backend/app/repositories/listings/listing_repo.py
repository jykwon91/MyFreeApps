import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.listing import Listing

# Allowlist of columns that can be updated via the dynamic `update_listing`
# function. Per the project security rule: "Always validate field names against
# an explicit allowlist before applying dynamic updates (`setattr`, spread
# operators, etc.)." Tenant-scoping columns (organization_id, user_id) and
# server-managed columns (id, created_at, deleted_at) are deliberately excluded.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "property_id",
    "title",
    "description",
    "monthly_rate",
    "weekly_rate",
    "nightly_rate",
    "min_stay_days",
    "max_stay_days",
    "room_type",
    "private_bath",
    "parking_assigned",
    "furnished",
    "status",
    "amenities",
    "pets_on_premises",
    "large_dog_disclosure",
    # ``slug`` is omitted from the operator-updatable allowlist — it's set
    # server-side at create time and shouldn't be edited via PATCH because
    # the URL is plastered across external listing channels.
})


async def get_by_id(
    db: AsyncSession,
    listing_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> Listing | None:
    """Return the listing iff it exists, is not soft-deleted, and belongs to the given org."""
    result = await db.execute(
        select(Listing).where(
            Listing.id == listing_id,
            Listing.organization_id == organization_id,
            Listing.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def get_by_slug(db: AsyncSession, slug: str) -> Listing | None:
    """Look up a non-deleted listing by its public slug.

    Used by the public inquiry form (``GET /apply/<slug>``) to resolve the
    listing without an organization scope — the slug itself is the capability.
    Returns None for soft-deleted listings so the form 404s once a host
    archives a listing.
    """
    result = await db.execute(
        select(Listing).where(
            Listing.slug == slug,
            Listing.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def list_by_organization(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Listing]:
    """List non-deleted listings for an organization, newest first."""
    stmt = select(Listing).where(
        Listing.organization_id == organization_id,
        Listing.deleted_at.is_(None),
    )
    if status is not None:
        stmt = stmt.where(Listing.status == status)
    stmt = stmt.order_by(Listing.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_by_organization(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    status: str | None = None,
) -> int:
    """Count non-deleted listings for an organization (matching the same filter
    used by `list_by_organization`). Powers the paginated envelope's `total`."""
    stmt = select(func.count(Listing.id)).where(
        Listing.organization_id == organization_id,
        Listing.deleted_at.is_(None),
    )
    if status is not None:
        stmt = stmt.where(Listing.status == status)
    result = await db.execute(stmt)
    return int(result.scalar_one() or 0)


async def create_listing(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID,
    title: str,
    monthly_rate: Decimal,
    room_type: str,
    status: str = "draft",
    description: str | None = None,
    weekly_rate: Decimal | None = None,
    nightly_rate: Decimal | None = None,
    min_stay_days: int | None = None,
    max_stay_days: int | None = None,
    private_bath: bool = False,
    parking_assigned: bool = False,
    furnished: bool = True,
    amenities: list[str] | None = None,
    pets_on_premises: bool = False,
    large_dog_disclosure: str | None = None,
    slug: str | None = None,
) -> Listing:
    """Construct and persist a Listing.

    Mirrors `property_repo.create_property` — accepts every column on Listing
    except server-managed ones. Caller scopes by org. ``slug`` is generated
    by ``listing_service.create_listing`` (which retries on UNIQUE collision)
    before this function runs.
    """
    listing = Listing(
        organization_id=organization_id,
        user_id=user_id,
        property_id=property_id,
        title=title,
        description=description,
        monthly_rate=monthly_rate,
        weekly_rate=weekly_rate,
        nightly_rate=nightly_rate,
        min_stay_days=min_stay_days,
        max_stay_days=max_stay_days,
        room_type=room_type,
        private_bath=private_bath,
        parking_assigned=parking_assigned,
        furnished=furnished,
        status=status,
        amenities=amenities if amenities is not None else [],
        pets_on_premises=pets_on_premises,
        large_dog_disclosure=large_dog_disclosure,
        slug=slug,
    )
    db.add(listing)
    await db.flush()
    return listing


async def update_listing(
    db: AsyncSession,
    listing_id: uuid.UUID,
    organization_id: uuid.UUID,
    fields: dict[str, Any],
) -> Listing | None:
    """Apply allowlisted updates to a listing.

    Filters `fields` against `_UPDATABLE_COLUMNS` before applying — any keys
    outside the allowlist are silently dropped (a defense-in-depth check on
    top of the Pydantic schema's `extra='forbid'`). Returns the refreshed
    listing, or None if the listing does not exist / is soft-deleted / belongs
    to a different organization.
    """
    listing = await get_by_id(db, listing_id, organization_id)
    if listing is None:
        return None

    safe_fields = {k: v for k, v in fields.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return listing

    for key, value in safe_fields.items():
        setattr(listing, key, value)
    await db.flush()
    return listing


async def soft_delete_by_id(
    db: AsyncSession,
    listing_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    """Soft-delete a listing scoped to an organization.

    Returns True if a row was updated (i.e. the listing existed and was not
    already soft-deleted). Returns False otherwise so the route layer can
    respond with 404 without an extra round trip.
    """
    result = await db.execute(
        update(Listing)
        .where(
            Listing.id == listing_id,
            Listing.organization_id == organization_id,
            Listing.deleted_at.is_(None),
        )
        .values(deleted_at=datetime.now(timezone.utc))
    )
    return (result.rowcount or 0) > 0


async def hard_delete_by_id(
    db: AsyncSession,
    listing_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> None:
    """Hard-delete a listing scoped to an organization. Test-utility only —
    production code uses soft-delete (set deleted_at)."""
    await db.execute(
        delete(Listing).where(
            Listing.id == listing_id,
            Listing.organization_id == organization_id,
        )
    )


async def list_by_channel(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    channel: str,
) -> list[Listing]:
    """Return non-deleted listings linked to a specific booking channel.

    Used by the Airbnb payout attribution path to find candidate listings.
    """
    from app.models.listings.channel_listing import ChannelListing
    from app.models.listings.channel import Channel
    result = await db.execute(
        select(Listing)
        .join(ChannelListing, ChannelListing.listing_id == Listing.id)
        .join(Channel, Channel.id == ChannelListing.channel_id)
        .where(
            Listing.organization_id == organization_id,
            Listing.user_id == user_id,
            Listing.deleted_at.is_(None),
            Channel.slug == channel,
        )
    )
    return list(result.scalars().all())
