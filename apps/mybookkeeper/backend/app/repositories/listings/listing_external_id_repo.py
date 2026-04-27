import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.listing import Listing
from app.models.listings.listing_external_id import ListingExternalId

# Allowlist of columns mutable via PATCH /listings/{id}/external-ids/{ext_id}.
# `source` is immutable post-create — switching source on an existing row
# would violate the (source, external_id) partial UNIQUE invariant in
# subtle ways. Callers who want to change the source must delete + recreate.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "external_id",
    "external_url",
})


async def list_by_listing(
    db: AsyncSession,
    listing_id: uuid.UUID,
) -> list[ListingExternalId]:
    """List external-platform identifiers attached to a listing."""
    result = await db.execute(
        select(ListingExternalId)
        .where(ListingExternalId.listing_id == listing_id)
        .order_by(ListingExternalId.source.asc(), ListingExternalId.created_at.asc())
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession,
    ext_pk: uuid.UUID,
    listing_id: uuid.UUID,
) -> ListingExternalId | None:
    """Return the external-id row iff it exists and belongs to the given listing."""
    result = await db.execute(
        select(ListingExternalId).where(
            ListingExternalId.id == ext_pk,
            ListingExternalId.listing_id == listing_id,
        )
    )
    return result.scalar_one_or_none()


async def get_by_source_and_external_id(
    db: AsyncSession,
    source: str,
    external_id: str,
) -> ListingExternalId | None:
    """Return the row claiming a given (source, external_id) pair, if any.

    NOTE: this lookup is unscoped — used for tests and as a building block
    for the org-scoped variant below. Production code that surfaces conflict
    messaging to a user MUST use `find_listing_id_by_source_and_external_id`
    so we never leak existence of records owned by another organization.
    """
    result = await db.execute(
        select(ListingExternalId).where(
            ListingExternalId.source == source,
            ListingExternalId.external_id == external_id,
        )
    )
    return result.scalar_one_or_none()


async def find_listing_id_by_source_and_external_id(
    db: AsyncSession,
    organization_id: uuid.UUID,
    source: str,
    external_id: str,
) -> uuid.UUID | None:
    """Return the listing_id claiming `(source, external_id)` within an organization.

    Filters by `organization_id` via a join on `listings` so that a collision
    in another tenant returns None — never leaking existence of cross-tenant
    data. The DB-level partial UNIQUE on `(source, external_id)` is global
    (it has to be — different tenants legitimately use different
    external_id values), but our 409-conflict UX must only surface
    same-org collisions to the host.
    """
    result = await db.execute(
        select(ListingExternalId.listing_id)
        .join(Listing, Listing.id == ListingExternalId.listing_id)
        .where(
            ListingExternalId.source == source,
            ListingExternalId.external_id == external_id,
            Listing.organization_id == organization_id,
            Listing.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def exists_for_source(
    db: AsyncSession,
    listing_id: uuid.UUID,
    source: str,
) -> bool:
    """Pre-check for the (listing_id, source) UNIQUE constraint.

    Used by the service layer to surface a friendly 409 message before the
    DB throws an IntegrityError. The DB constraint remains the authoritative
    enforcement — this is just for UX.
    """
    result = await db.execute(
        select(ListingExternalId.id).where(
            ListingExternalId.listing_id == listing_id,
            ListingExternalId.source == source,
        )
    )
    return result.scalar_one_or_none() is not None


async def create(
    db: AsyncSession,
    *,
    listing_id: uuid.UUID,
    source: str,
    external_id: str | None,
    external_url: str | None,
) -> ListingExternalId:
    """Insert a new external-id row.

    The caller is responsible for conflict pre-checks; this function relies
    on the DB unique constraints for authoritative enforcement.
    """
    row = ListingExternalId(
        listing_id=listing_id,
        source=source,
        external_id=external_id,
        external_url=external_url,
    )
    db.add(row)
    await db.flush()
    return row


async def update(
    db: AsyncSession,
    listing_id: uuid.UUID,
    ext_pk: uuid.UUID,
    fields: dict[str, Any],
) -> ListingExternalId | None:
    """Apply allowlisted updates to an external-id row.

    Filters `fields` against `_UPDATABLE_COLUMNS` before touching the row.
    Returns the refreshed row, or None if it doesn't exist / belongs to a
    different listing.
    """
    row = await get_by_id(db, ext_pk, listing_id)
    if row is None:
        return None

    safe_fields = {k: v for k, v in fields.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return row

    for key, value in safe_fields.items():
        setattr(row, key, value)
    await db.flush()
    return row


async def delete_by_id(
    db: AsyncSession,
    listing_id: uuid.UUID,
    ext_pk: uuid.UUID,
) -> bool:
    """Hard-delete an external-id row scoped to a listing.

    Returns True iff a row was deleted. The row is pure metadata (no
    business value in retaining a removed link), so soft-delete is not
    used here.
    """
    result = await db.execute(
        delete(ListingExternalId).where(
            ListingExternalId.id == ext_pk,
            ListingExternalId.listing_id == listing_id,
        )
    )
    return (result.rowcount or 0) > 0
