"""Service for manual applicant stage transitions.

Hosts can approve/decline/reset an applicant without uploading a screening
report. The future screening rebuild will repurpose this UI to write a
``screening_decision`` column instead of ``stage`` — a ~5-line frontend
change at that time.

Transition rules intentionally allow host overrides (e.g. ``screening_failed``
→ ``approved``) for the common case where the host has done manual checks.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.applicant_enums import APPLICANT_STAGES
from app.db.session import unit_of_work
from app.repositories.applicants import applicant_event_repo, applicant_repo
from app.schemas.applicants.applicant_detail_response import ApplicantDetailResponse
from app.services.applicants import applicant_service

# Allowed transitions per stage. ``set()`` means no forward transitions
# (terminal state). The service enforces this before writing any rows.
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "lead": {"screening_pending", "approved", "declined"},
    "screening_pending": {"screening_passed", "screening_failed", "approved", "declined"},
    "screening_passed": {"video_call_done", "approved", "declined"},
    "screening_failed": {"declined", "approved"},
    "video_call_done": {"approved", "declined"},
    "approved": {"lease_sent", "declined"},
    "lease_sent": {"lease_signed", "declined"},
    "lease_signed": set(),
    "declined": {"lead"},
}


class InvalidStageError(ValueError):
    """The requested new_stage is not a known APPLICANT_STAGE."""


class InvalidTransitionError(ValueError):
    """The requested transition is not allowed from the current stage."""


def _validate_new_stage(new_stage: str) -> None:
    if new_stage not in APPLICANT_STAGES:
        raise InvalidStageError(
            f"Unknown stage {new_stage!r}. "
            f"Valid stages: {', '.join(APPLICANT_STAGES)}",
        )


def _validate_transition(current_stage: str, new_stage: str) -> None:
    allowed = ALLOWED_TRANSITIONS.get(current_stage, set())
    if new_stage not in allowed:
        if not allowed:
            raise InvalidTransitionError(
                f"Stage {current_stage!r} is terminal — no further transitions are allowed.",
            )
        raise InvalidTransitionError(
            f"Cannot transition from {current_stage!r} to {new_stage!r}. "
            f"Allowed next stages: {', '.join(sorted(allowed))}",
        )


async def transition_stage(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    applicant_id: uuid.UUID,
    new_stage: str,
    note: str | None,
) -> ApplicantDetailResponse:
    """Transition an applicant's stage and record it in the event timeline.

    Raises:
        LookupError: applicant not found in the calling tenant.
        InvalidStageError: new_stage is not a known APPLICANT_STAGE.
        InvalidTransitionError: the transition is not allowed from the
            current stage.
    """
    _validate_new_stage(new_stage)

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

        old_stage = applicant.stage
        _validate_transition(old_stage, new_stage)

        await applicant_repo.update_stage(
            db,
            applicant=applicant,
            new_stage=new_stage,
            now=now,
        )

        await applicant_event_repo.append(
            db,
            applicant_id=applicant.id,
            event_type="stage_changed",
            actor="host",
            occurred_at=now,
            payload={"from": old_stage, "to": new_stage, "note": note},
        )

    # Re-load via the read service so the response shape is identical to
    # GET /applicants/{id} — same schema, same nested children.
    return await applicant_service.get_applicant(
        organization_id, user_id, applicant_id,
    )
