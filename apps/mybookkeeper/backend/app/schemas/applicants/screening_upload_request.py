"""Request shape for ``POST /applicants/{id}/screening/upload-result``.

The route accepts a multipart form (file + status + optional snippet); this
schema mirrors the form-field validation. ``status`` is constrained to the
canonical SCREENING_STATUSES tuple from ``app.core.applicant_enums`` —
keeping the values centralised so the model CheckConstraint and the schema
stay in sync.

``adverse_action_snippet`` is FCRA-relevant: it captures the short reason
("Credit score below threshold") that drives an adverse action notice. NOT
PII per RENTALS_PLAN.md §8.7 — stored plaintext, included in audit logs as
an auditable business decision.
"""
from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from app.core.applicant_enums import SCREENING_STATUSES


class ScreeningUploadRequest(BaseModel):
    status: str = Field(..., description="Outcome reported by the provider")
    adverse_action_snippet: str | None = Field(
        default=None,
        max_length=2000,
        description=(
            "Short summary used to generate an FCRA adverse-action notice. "
            "Required when status is 'fail' or 'inconclusive' since both "
            "outcomes can trigger an adverse action."
        ),
    )

    @model_validator(mode="after")
    def _validate_status(self) -> "ScreeningUploadRequest":
        if self.status not in SCREENING_STATUSES:
            allowed = ", ".join(SCREENING_STATUSES)
            raise ValueError(
                f"status must be one of: {allowed} (got {self.status!r})",
            )
        if self.adverse_action_snippet is not None:
            self.adverse_action_snippet = self.adverse_action_snippet.strip() or None
        return self
