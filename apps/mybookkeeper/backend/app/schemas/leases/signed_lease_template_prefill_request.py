"""Request body for POST /signed-leases/{lease_id}/template-prefill.

Distinct from ``SignedLeaseAddTemplatesRequest`` — prefill is a dry-run
read that only needs the template_ids the host has selected. The
``values`` field on ``SignedLeaseAddTemplatesRequest`` is irrelevant
here (the prefill endpoint computes its own resolved values).
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, field_validator


class SignedLeaseTemplatePrefillRequest(BaseModel):
    template_ids: list[uuid.UUID]

    @field_validator("template_ids")
    @classmethod
    def require_non_empty(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if not v:
            raise ValueError("template_ids must contain at least one id")
        return v
