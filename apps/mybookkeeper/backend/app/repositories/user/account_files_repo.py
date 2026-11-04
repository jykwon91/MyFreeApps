"""Which stored files belong to the workspaces an account deletion removes."""
import uuid
from collections.abc import Sequence

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.screening_result import ScreeningResult
from app.models.applicants.video_call_note import VideoCallNote
from app.models.documents.document import Document
from app.models.insurance.insurance_policy import InsurancePolicy
from app.models.insurance.insurance_policy_attachment import InsurancePolicyAttachment
from app.models.leases.lease_template import LeaseTemplate
from app.models.leases.lease_template_file import LeaseTemplateFile
from app.models.leases.signed_lease import SignedLease
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.models.listings.listing import Listing
from app.models.listings.listing_blackout import ListingBlackout
from app.models.listings.listing_blackout_attachment import ListingBlackoutAttachment
from app.models.listings.listing_photo import ListingPhoto
from app.models.welcome_manuals.welcome_manual import WelcomeManual
from app.models.welcome_manuals.welcome_manual_section import WelcomeManualSection
from app.models.welcome_manuals.welcome_manual_section_image import WelcomeManualSectionImage


def _queries(organization_ids: Sequence[uuid.UUID]) -> list[Select]:
    return [
        select(Document.file_storage_key)
        .where(Document.organization_id.in_(organization_ids)),
        select(Applicant.id_document_storage_key)
        .where(Applicant.organization_id.in_(organization_ids)),
        select(VideoCallNote.transcript_storage_key)
        .join(Applicant, VideoCallNote.applicant_id == Applicant.id)
        .where(Applicant.organization_id.in_(organization_ids)),
        select(ScreeningResult.report_storage_key)
        .join(Applicant, ScreeningResult.applicant_id == Applicant.id)
        .where(Applicant.organization_id.in_(organization_ids)),
        select(ListingPhoto.storage_key)
        .join(Listing, ListingPhoto.listing_id == Listing.id)
        .where(Listing.organization_id.in_(organization_ids)),
        select(ListingBlackoutAttachment.storage_key)
        .join(ListingBlackout, ListingBlackoutAttachment.listing_blackout_id == ListingBlackout.id)
        .join(Listing, ListingBlackout.listing_id == Listing.id)
        .where(Listing.organization_id.in_(organization_ids)),
        select(SignedLeaseAttachment.storage_key)
        .join(SignedLease, SignedLeaseAttachment.lease_id == SignedLease.id)
        .where(SignedLease.organization_id.in_(organization_ids)),
        select(LeaseTemplateFile.storage_key)
        .join(LeaseTemplate, LeaseTemplateFile.template_id == LeaseTemplate.id)
        .where(LeaseTemplate.organization_id.in_(organization_ids)),
        select(InsurancePolicyAttachment.storage_key)
        .join(InsurancePolicy, InsurancePolicyAttachment.policy_id == InsurancePolicy.id)
        .where(InsurancePolicy.organization_id.in_(organization_ids)),
        select(WelcomeManualSectionImage.storage_key)
        .join(WelcomeManualSection, WelcomeManualSectionImage.section_id == WelcomeManualSection.id)
        .join(WelcomeManual, WelcomeManualSection.manual_id == WelcomeManual.id)
        .where(WelcomeManual.organization_id.in_(organization_ids)),
    ]


async def list_storage_keys(db: AsyncSession, organization_ids: Sequence[uuid.UUID]) -> list[str]:
    """Every stored file in these workspaces, soft-deleted records included."""
    keys: set[str] = set()
    for query in _queries(organization_ids):
        keys.update(key for key in (await db.scalars(query)).all() if key)
    return sorted(keys)
