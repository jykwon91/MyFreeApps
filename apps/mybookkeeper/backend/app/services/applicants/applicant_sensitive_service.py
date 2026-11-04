"""Hand out an applicant's private details, recording who asked.

The record and the read share a transaction, so a failed record means no data.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.db.session import unit_of_work
from app.repositories.applicants import (
    applicant_event_repo,
    applicant_repo,
    reference_repo,
    screening_result_repo,
)
from app.schemas.applicants.applicant_sensitive_response import ApplicantSensitiveResponse
from app.schemas.applicants.reference_contact_response import ReferenceContactResponse
from app.schemas.applicants.screening_report_response import ScreeningReportResponse
from app.services.screening.screening_response_builder import attach_presigned_urls


async def reveal(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
) -> ApplicantSensitiveResponse:
    """Raises ``LookupError`` if the applicant isn't in the calling tenant."""
    async with unit_of_work() as db:
        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise LookupError(f"Applicant {applicant_id} not found")
        await applicant_event_repo.append(
            db,
            applicant_id=applicant.id,
            event_type="sensitive_revealed",
            actor="host",
            occurred_at=_dt.datetime.now(_dt.timezone.utc),
            payload={"user_id": str(user_id)},
        )
        references = await reference_repo.list_for_applicant(
            db,
            applicant_id=applicant.id,
            organization_id=organization_id,
            user_id=user_id,
        )
        screening_results = await screening_result_repo.list_for_applicant(
            db,
            applicant_id=applicant.id,
            organization_id=organization_id,
            user_id=user_id,
        )
        details = ApplicantSensitiveResponse(
            dob=applicant.dob,
            vehicle_make_model=applicant.vehicle_make_model,
            contact_email=applicant.contact_email,
            contact_phone=applicant.contact_phone,
            references=[ReferenceContactResponse.model_validate(r) for r in references],
            screening_reports=[ScreeningReportResponse.model_validate(s) for s in screening_results],
        )
    # Outside the transaction: this makes a storage call per report.
    return details.model_copy(update={
        "screening_reports": attach_presigned_urls(details.screening_reports),
    })
