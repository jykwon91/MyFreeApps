"""Listings service — orchestration only.

Per the layered-architecture rule: services orchestrate (load → decide → persist),
repositories own all queries. Tenant isolation is via `organization_id`; `user_id`
is accepted for the audit-log context but is not used as a filter (per
RENTALS_PLAN.md §4.1: organization_id is the primary scoping column).
"""
import uuid

from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import (
    listing_external_id_repo,
    listing_photo_repo,
    listing_repo,
    property_repo,
)
from app.schemas.listings.listing_create_request import ListingCreateRequest
from app.schemas.listings.listing_external_id_response import ListingExternalIdResponse
from app.schemas.listings.listing_list_response import ListingListResponse
from app.schemas.listings.listing_photo_response import ListingPhotoResponse
from app.schemas.listings.listing_response import ListingResponse
from app.schemas.listings.listing_summary import ListingSummary
from app.schemas.listings.listing_update_request import ListingUpdateRequest
from app.services.listings.listing_slug import generate_slug
from app.services.listings.photo_response_builder import attach_presigned_urls

# Number of slug-collision retries before giving up. The 32^6 keyspace makes
# even a single collision astronomically unlikely on a small portfolio, but
# the retry loop is cheap defense in depth — and important if a future
# operator has thousands of listings.
_SLUG_GENERATION_ATTEMPTS = 5


def _to_listing_response(listing, photos=(), external_ids=()) -> ListingResponse:
    """Convert an ORM Listing + its related rows to a response model.

    Centralising this construction prevents drift between get + create + update
    response shapes. Presigned URLs for photos are minted here (single seam)
    so callers never see a `ListingPhotoResponse` without `presigned_url`
    attempted.
    """
    base = ListingResponse.model_validate(listing)
    photo_responses = [ListingPhotoResponse.model_validate(p) for p in photos]
    return base.model_copy(update={
        "amenities": list(listing.amenities or []),
        "photos": attach_presigned_urls(photo_responses),
        "external_ids": [ListingExternalIdResponse.model_validate(x) for x in external_ids],
    })


async def get_listing(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context, see module docstring
    listing_id: uuid.UUID,
) -> ListingResponse:
    """Load a single listing with its photos and external IDs.

    Raises LookupError if the listing does not exist, is soft-deleted, or
    belongs to a different organization.
    """
    async with AsyncSessionLocal() as db:
        listing = await listing_repo.get_by_id(db, listing_id, organization_id)
        if listing is None:
            raise LookupError(f"Listing {listing_id} not found")
        photos = await listing_photo_repo.list_by_listing(db, listing.id)
        external_ids = await listing_external_id_repo.list_by_listing(db, listing.id)
    return _to_listing_response(listing, photos, external_ids)


async def list_listings(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context, see module docstring
    *,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> ListingListResponse:
    """List active (non-deleted) listings for an organization.

    Returns a paginated envelope (`items`, `total`, `has_more`) so the frontend
    can hide the "Load more" button on the last page without an infinite-poll
    edge case (see TECH_DEBT.md "Listings page Load more pagination has no
    terminator").
    """
    async with AsyncSessionLocal() as db:
        listings = await listing_repo.list_by_organization(
            db, organization_id, status=status, limit=limit, offset=offset,
        )
        total = await listing_repo.count_by_organization(
            db, organization_id, status=status,
        )
    items = [ListingSummary.model_validate(listing) for listing in listings]
    has_more = (offset + len(items)) < total
    return ListingListResponse(items=items, total=total, has_more=has_more)


async def create_listing(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: ListingCreateRequest,
) -> ListingResponse:
    """Create a new listing scoped to the caller's organization.

    Verifies the supplied `property_id` belongs to the same organization
    before insert — forbids creating listings against another org's property.

    Raises LookupError if `property_id` is not in the caller's org.
    """
    async with unit_of_work() as db:
        prop = await property_repo.get_by_id(db, payload.property_id, organization_id)
        if prop is None:
            raise LookupError(f"Property {payload.property_id} not found")

        # Generate the public-form slug. Pre-check for collisions so we don't
        # rely on catching IntegrityError mid-transaction (which would taint
        # the unit_of_work and force a rollback for an extremely rare event).
        slug = generate_slug(payload.title)
        for _attempt in range(_SLUG_GENERATION_ATTEMPTS - 1):
            existing = await listing_repo.get_by_slug(db, slug)
            if existing is None:
                break
            slug = generate_slug(payload.title)

        listing = await listing_repo.create_listing(
            db,
            organization_id=organization_id,
            user_id=user_id,
            property_id=payload.property_id,
            title=payload.title,
            description=payload.description,
            monthly_rate=payload.monthly_rate,
            weekly_rate=payload.weekly_rate,
            nightly_rate=payload.nightly_rate,
            min_stay_days=payload.min_stay_days,
            max_stay_days=payload.max_stay_days,
            room_type=payload.room_type,
            private_bath=payload.private_bath,
            parking_assigned=payload.parking_assigned,
            furnished=payload.furnished,
            status=payload.status,
            amenities=payload.amenities,
            pets_on_premises=payload.pets_on_premises,
            large_dog_disclosure=payload.large_dog_disclosure,
            slug=slug,
        )
        return _to_listing_response(listing)


async def update_listing(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context, see module docstring
    listing_id: uuid.UUID,
    payload: ListingUpdateRequest,
) -> ListingResponse:
    """Apply allowlisted updates to a listing.

    Raises LookupError if the listing does not exist / is soft-deleted /
    belongs to a different organization, or if the update changes
    `property_id` to a property outside the caller's organization.
    """
    fields = payload.to_update_dict()

    async with unit_of_work() as db:
        # If the caller is moving the listing to a different property, verify
        # that property is in their org first.
        new_property_id = fields.get("property_id")
        if new_property_id is not None:
            prop = await property_repo.get_by_id(db, new_property_id, organization_id)
            if prop is None:
                raise LookupError(f"Property {new_property_id} not found")

        listing = await listing_repo.update_listing(db, listing_id, organization_id, fields)
        if listing is None:
            raise LookupError(f"Listing {listing_id} not found")

        photos = await listing_photo_repo.list_by_listing(db, listing.id)
        external_ids = await listing_external_id_repo.list_by_listing(db, listing.id)
        return _to_listing_response(listing, photos, external_ids)


async def soft_delete_listing(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context, see module docstring
    listing_id: uuid.UUID,
) -> None:
    """Soft-delete a listing scoped to the caller's organization.

    Raises LookupError if no row was updated (listing missing, already
    soft-deleted, or in a different org).
    """
    async with unit_of_work() as db:
        deleted = await listing_repo.soft_delete_by_id(db, listing_id, organization_id)
    if not deleted:
        raise LookupError(f"Listing {listing_id} not found")
