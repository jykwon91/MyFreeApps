"""Service for changing an applicant's contact email.

The address is PII (encrypted at rest), so the ``contact_email_changed``
event records only whether an address was added, changed or removed —
never the address itself.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.db.session import unit_of_work
from app.repositories.applicants import applicant_event_repo, applicant_repo
from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
from app.services.applicants import applicant_service


def _change_kind(old: str | None, new: str | None) -> str | None:
    if old == new:
        return None
    if old is None:
        return "added"
    if new is None:
        return "removed"
    return "changed"


async def update_contact_email(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    contact_email: str | None,
) -> ApplicantDetailResponse:
    """Set or clear the applicant's contact email.

    Raises:
        LookupError: applicant not found for (organization_id, user_id).
    """
    now = _dt.datetime.now(_dt.UTC)

    async with unit_of_work() as db:
        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise LookupError(f"Applicant {applicant_id} not found")

        change = _change_kind(applicant.contact_email or None, contact_email)
        if change is not None:
            await applicant_repo.update_contact_email(
                db, applicant=applicant, contact_email=contact_email, now=now,
            )
            await applicant_event_repo.append(
                db,
                applicant_id=applicant.id,
                event_type="contact_email_changed",
                actor="host",
                occurred_at=now,
                payload={"change": change},
            )

    return await applicant_service.get_applicant(
        organization_id, user_id, applicant_id,
    )
