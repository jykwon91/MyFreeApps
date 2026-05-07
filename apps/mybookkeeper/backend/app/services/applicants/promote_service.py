"""Promotion service — Inquiry → Applicant.

Per the layered-architecture rule: services orchestrate (load → decide →
persist), repositories own queries. All multi-write paths run inside a
single ``unit_of_work`` transaction so a partial promote (applicant
inserted but events / stage update missed) is impossible.

Flow per RENTALS_PLAN.md §6.2 cross-domain mapping:
1. Load inquiry by id, scoped to (organization_id, user_id) — 404 if not owned.
2. Reject if the inquiry stage is terminal (``declined`` or ``archived``) —
   the host shouldn't be able to promote a rejected inquiry. Returns 409.
3. Reject if an active applicant already exists for this inquiry — returns
   409 with the existing applicant_id so the frontend can navigate.
4. Auto-fill missing override fields from inquiry PII (round-trips through
   EncryptedString — plaintext on read, re-encrypted on write).
5. Persist Applicant in stage=``lead``.
6. Append two events atomically:
   - ``applicant_events``: ``lead`` (applicant created)
   - ``inquiry_events``: ``converted`` (inquiry transitions out of inbox)
7. Update inquiry stage to ``converted``.

Cross-org / wrong-user requests resolve to "inquiry not found" (404). We
never leak the existence of a row a tenant doesn't own.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.applicant_constants import APPLICANT_DOB_ISO_FORMAT
from app.db.session import unit_of_work
from app.models.applicants.applicant import Applicant
from app.repositories import (
    applicant_event_repo,
    applicant_repo,
    inquiry_event_repo,
    inquiry_repo,
)
from app.schemas.applicants.applicant_promote_request import ApplicantPromoteRequest


# Inquiry stages that BLOCK promotion. Anything else (new, triaged, replied,
# screening_requested, video_call_scheduled, approved) is promotable.
# `converted` is implicitly blocked because get_by_inquiry will already
# return the existing applicant, raising AlreadyPromotedError before we
# inspect the stage.
_NON_PROMOTABLE_STAGES: frozenset[str] = frozenset({"declined", "archived"})


class InquiryNotPromotableError(Exception):
    """Inquiry is in a stage from which promotion is not allowed (e.g. declined)."""

    def __init__(self, stage: str) -> None:
        super().__init__(
            f"Cannot promote an inquiry in stage {stage!r}. "
            "Decline / archive inquiries are terminal.",
        )
        self.stage = stage


class AlreadyPromotedError(Exception):
    """An applicant has already been created for this inquiry."""

    def __init__(self, applicant_id: uuid.UUID) -> None:
        super().__init__(f"Inquiry already promoted to applicant {applicant_id}")
        self.applicant_id = applicant_id


def _coalesce(*values: str | None) -> str | None:
    """Return the first non-None, non-empty value, else None.

    Used to merge host overrides with auto-fill from the inquiry — host
    overrides win, inquiry values fill gaps, otherwise leave the field empty.
    """
    for value in values:
        if value is not None and value != "":
            return value
    return None


def _coalesce_date(*values: _dt.date | None) -> _dt.date | None:
    for value in values:
        if value is not None:
            return value
    return None


async def promote_from_inquiry(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    inquiry_id: uuid.UUID,
    overrides: ApplicantPromoteRequest,
) -> Applicant:
    """Atomically convert an Inquiry into an Applicant.

    Raises:
        LookupError: inquiry not found in the calling tenant.
        AlreadyPromotedError: an active applicant already exists for the inquiry.
        InquiryNotPromotableError: inquiry is in a non-promotable stage.
    """
    now = _dt.datetime.now(_dt.timezone.utc)

    async with unit_of_work() as db:
        inquiry = await inquiry_repo.get_by_id(db, inquiry_id, organization_id)
        if inquiry is None or inquiry.user_id != user_id:
            # Tenant isolation: never leak existence of a row another user owns.
            raise LookupError(f"Inquiry {inquiry_id} not found")

        if inquiry.stage in _NON_PROMOTABLE_STAGES:
            raise InquiryNotPromotableError(inquiry.stage)

        existing = await applicant_repo.get_by_inquiry(
            db,
            inquiry_id=inquiry_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if existing is not None:
            raise AlreadyPromotedError(existing.id)

        # Auto-fill mapping per RENTALS_PLAN.md §6.2.
        legal_name = _coalesce(overrides.legal_name, inquiry.inquirer_name)
        employer = _coalesce(
            overrides.employer_or_hospital, inquiry.inquirer_employer,
        )
        contact_email = _coalesce(overrides.contact_email, inquiry.inquirer_email)
        contact_phone = _coalesce(overrides.contact_phone, inquiry.inquirer_phone)
        contract_start = _coalesce_date(
            overrides.contract_start,
            inquiry.desired_start_date,
            inquiry.move_in_date,
        )
        contract_end = _coalesce_date(
            overrides.contract_end,
            inquiry.desired_end_date,
            inquiry.move_out_date,
        )

        # ``dob`` is stored as ISO-8601 text on an EncryptedString column
        # so the type decorator can encrypt it. The Pydantic schema accepts
        # a ``date`` for type-safe validation; convert here.
        dob_iso = (
            overrides.dob.strftime(APPLICANT_DOB_ISO_FORMAT)
            if overrides.dob is not None
            else None
        )

        applicant = await applicant_repo.create(
            db,
            organization_id=organization_id,
            user_id=user_id,
            inquiry_id=inquiry.id,
            legal_name=legal_name,
            dob=dob_iso,
            employer_or_hospital=employer,
            vehicle_make_model=overrides.vehicle_make_model,
            contact_email=contact_email,
            contact_phone=contact_phone,
            contract_start=contract_start,
            contract_end=contract_end,
            smoker=overrides.smoker,
            pets=overrides.pets,
            referred_by=overrides.referred_by,
            stage="lead",
        )

        # Applicant timeline — seed event so the funnel analytics can see
        # the new lead.
        await applicant_event_repo.append(
            db,
            applicant_id=applicant.id,
            event_type="lead",
            actor="host",
            occurred_at=now,
        )

        # Inquiry timeline — record the conversion + advance the stage so
        # the inbox view drops it out of the active pipeline.
        await inquiry_event_repo.create(
            db,
            inquiry_id=inquiry.id,
            event_type="converted",
            actor="host",
            occurred_at=now,
        )
        await inquiry_repo.update_inquiry(
            db, inquiry.id, organization_id, {"stage": "converted"},
        )

    return applicant
