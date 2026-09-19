"""DB-aware helpers shared by the attribution pipeline and the review API.

Extracted from ``attribution_service`` so that module stays under the
file-size growth guard. These two helpers resolve tenant→property links and
fetch the org's active ``lease_signed`` applicants; both the ingestion-time
auto-attribution pipeline and the host-facing review/manual-attribute paths
depend on them.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.repositories.applicants import applicant_repo
from app.repositories.listings import listing_repo
from app.services.leases.listing_resolution import resolve_listing_id_for_applicant


async def _get_lease_signed_applicants(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[Applicant]:
    """Fetch all active lease_signed applicants for the org/user."""
    return await applicant_repo.list_for_user(
        db,
        organization_id=organization_id,
        user_id=user_id,
        stage="lease_signed",
        include_deleted=False,
        limit=500,
        offset=0,
    )


async def _get_property_id_for_applicant(
    db: AsyncSession,
    applicant: Applicant,
    organization_id: uuid.UUID,
) -> uuid.UUID | None:
    """Resolve the property_id linked to an applicant via their listing.

    Walks: applicant → signed_lease (or inquiry) → listing → property_id.
    Returns the property_id, or None when the chain is broken.

    A lease without a ``listing_id`` used to end the walk here, which left
    every auto-attributed payment for that tenant with no property — the money
    landed in the dashboard's "Unassigned" bucket instead of their property.
    ``resolve_listing_id_for_applicant`` falls back to the inquiry's listing.
    """
    listing_id = await resolve_listing_id_for_applicant(db, applicant, organization_id)
    if listing_id is None:
        return None
    listing = await listing_repo.get_by_id(db, listing_id, organization_id)
    if listing is None:
        return None
    return listing.property_id
