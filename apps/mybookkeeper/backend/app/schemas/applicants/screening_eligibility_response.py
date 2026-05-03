"""Response shape for ``GET /applicants/{id}/screening/eligibility``.

The eligibility gate tells the frontend whether a screening can be initiated
for this applicant without needing to hard-code the eligibility logic in
multiple places.

``eligible`` — True iff every required field is present (name + at least one
contact method). When False, ``missing_fields`` lists the human-readable
labels for what's missing so the UI can surface an actionable message.

``has_pending`` — True iff the applicant already has a screening result with
status "pending" — used by the frontend to show the "waiting for results"
status panel instead of the provider grid.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ScreeningEligibilityResponse(BaseModel):
    eligible: bool
    missing_fields: list[str]
    has_pending: bool

    model_config = ConfigDict(extra="forbid")
