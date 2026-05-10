"""Service for updating an applicant's ``contract_start`` date.

``contract_end`` is no longer mutable on the applicant — it is derived from
the latest signed lease's ``ends_on`` (see ``Applicant.contract_end``
property). Pre-signature, the host enters the end date when creating the
lease draft; post-signature, the lease is the source of truth and an
extension creates a new ``lease_term_versions`` row.

Lock semantics (unchanged from prior versions):
    ``applicant.stage == 'lease_signed'`` → raise ``ContractDatesLockedError``
    which the route maps to HTTP 409 with detail ``CONTRACT_DATES_LOCKED``.

On success:
    - Updates ``contract_start`` and ``updated_at``.
    - Appends an ``applicant_events`` row with ``event_type =
      'contract_dates_changed'``, ``actor = 'host'``, recording the
      before / after values of ``contract_start``.
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
    contract_start_sent: bool,
) -> ApplicantDetailResponse:
    """Update ``contract_start`` for an applicant.

    The ``contract_start_sent`` boolean lets the route distinguish
    "field omitted from the request" (preserve existing value) from
    "field set to null" (clear the column). The route inspects
    ``payload.model_fields_set`` and forwards the boolean; the service
    stays Pydantic-agnostic.

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

        resolved_start = (
            contract_start if contract_start_sent else applicant.contract_start
        )

        await applicant_repo.update_contract_start(
            db,
            applicant=applicant,
            contract_start=resolved_start,
            now=now,
        )

        await applicant_event_repo.append(
            db,
            applicant_id=applicant.id,
            event_type="contract_dates_changed",
            actor="host",
            occurred_at=now,
            payload={
                "from": {"contract_start": old_start},
                "to": {"contract_start": _iso_or_none(resolved_start)},
            },
        )

    return await applicant_service.get_applicant(
        organization_id, user_id, applicant_id,
    )
