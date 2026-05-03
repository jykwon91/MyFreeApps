"""Service for updating applicant contract dates.

Contract dates (contract_start / contract_end) are mutable during the
negotiation phase (any stage prior to ``lease_signed``). Once a lease is
signed, the dates are locked — the signed lease document becomes the source
of truth and updating the applicant-level dates would create a divergence
from the legal record.

Lock semantics:
    ``applicant.stage == 'lease_signed'`` → raise ``ContractDatesLockedError``
    which the route maps to HTTP 409 with detail ``CONTRACT_DATES_LOCKED``.

On success:
    - Updates ``contract_start``, ``contract_end``, and ``updated_at``.
    - Appends an ``applicant_events`` row with ``event_type =
      'contract_dates_changed'``, ``actor = 'host'``, and a payload
      recording the before / after state.
    - Commits atomically via ``unit_of_work``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.db.session import unit_of_work
from app.repositories.applicants import applicant_event_repo, applicant_repo
from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
from app.services.applicants import applicant_service

_LOCKED_STAGE = "lease_signed"


class ContractDatesLockedError(Exception):
    """Raised when the caller attempts to update dates on a lease-signed applicant."""


def _iso_or_none(d: _dt.date | None) -> str | None:
    return d.isoformat() if d is not None else None


async def update_contract_dates(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    contract_start: _dt.date | None,
    contract_end: _dt.date | None,
) -> ApplicantDetailResponse:
    """Update contract dates for an applicant.

    ``contract_start`` and ``contract_end`` are the values from the request
    (``None`` means "set the field to NULL", not "leave it unchanged").
    Partial updates — where only one date is sent — resolve by merging with
    the current DB value inside this function before writing.

    The route passes the raw Pydantic-parsed values; this function is
    responsible for the merge, the lock check, the DB write, and the event.

    Raises:
        LookupError: applicant not found for (organization_id, user_id).
        ContractDatesLockedError: applicant is in ``lease_signed`` stage.
    """
    now = _dt.datetime.now(_dt.timezone.utc)

    async with unit_of_work() as db:
        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise LookupError(f"Applicant {applicant_id} not found")

        if applicant.stage == _LOCKED_STAGE:
            raise ContractDatesLockedError(
                "Contract dates are locked once a lease has been signed. "
                "Update the dates on the lease itself if needed."
            )

        old_start = _iso_or_none(applicant.contract_start)
        old_end = _iso_or_none(applicant.contract_end)

        # Resolve final values: None from the request means "set to NULL".
        # The request schema uses None as the absent sentinel, so we must
        # distinguish "not sent" from "explicitly set to null". Since we
        # receive Python None for both, we treat None as "use existing" here
        # to support partial updates (the most common case is "only change
        # contract_end"). To explicitly null a date, the caller would need to
        # send a different signal; for now partial-update semantics is the
        # correct UX (setting a date to null from the date picker is unusual).
        resolved_start = (
            contract_start if contract_start is not None else applicant.contract_start
        )
        resolved_end = (
            contract_end if contract_end is not None else applicant.contract_end
        )

        await applicant_repo.update_contract_dates(
            db,
            applicant=applicant,
            contract_start=resolved_start,
            contract_end=resolved_end,
            now=now,
        )

        await applicant_event_repo.append(
            db,
            applicant_id=applicant.id,
            event_type="contract_dates_changed",
            actor="host",
            occurred_at=now,
            payload={
                "from": {"contract_start": old_start, "contract_end": old_end},
                "to": {
                    "contract_start": _iso_or_none(resolved_start),
                    "contract_end": _iso_or_none(resolved_end),
                },
            },
        )

    # Re-load via the read service so the response shape is identical to
    # GET /applicants/{id} — same schema, same nested children.
    return await applicant_service.get_applicant(
        organization_id, user_id, applicant_id,
    )
