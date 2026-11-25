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
from app.services.leases.listing_resolution import resolve_property_id_for_applicant


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
    """Resolve the property an applicant's rent is filed under.

    Prefers the house their lease records (``signed_leases.property_id``), so a
    tenant of a house with no listing is still tied to it; falls back to the
    lease's listing, then the inquiry's listing. Returns None when nothing
    names a house — the money then lands in the dashboard's "Unassigned"
    bucket.
    """
    return await resolve_property_id_for_applicant(db, applicant, organization_id)
