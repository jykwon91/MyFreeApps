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
from app.repositories.leases import signed_lease_repo
from app.repositories.listings import listing_repo


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
    """Resolve the property_id linked to an applicant via their signed lease.

    Walks: applicant → signed_lease → listing → property_id.
    Returns the first non-null property_id found, or None.
    """
    leases = await signed_lease_repo.list_for_tenant(
        db,
        user_id=applicant.user_id,
        organization_id=organization_id,
        applicant_id=applicant.id,
        include_deleted=False,
        limit=5,
    )
    for lease in leases:
        if not lease.listing_id:
            continue
        listing = await listing_repo.get_by_id(db, lease.listing_id, organization_id)
        if listing and listing.property_id:
            return listing.property_id
    return None
