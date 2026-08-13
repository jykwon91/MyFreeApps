"""Schema for the body of ``POST /insurance-policies/extract``.

Deliberately NOT an ``InsurancePolicyCreateRequest``. A draft is what a document
appeared to say; a create request is what the operator asserts is true. Three
differences follow from that:

- Every field is optional, including ``policy_name``, which a real policy
  requires. A dec page whose product name is illegible produces a draft with no
  name, and the form asks for one — better than a 422 that discards the nine
  fields it did read.
- No cross-field validation. ``validate_policy_fields`` rejects a premium
  without its billing period; a document that states one and not the other is
  exactly the case the operator needs to see and fix, not have thrown away.
- It carries ``warnings`` and ``unrepresented``, which describe the reading
  rather than the policy, and have nowhere to live on a stored row.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, Field


class InsurancePolicyDraft(BaseModel):
    """A policy as read from a document — not yet saved, not yet validated."""

    source_document_id: uuid.UUID

    policy_name: str | None = None
    carrier: str | None = None
    policy_number: str | None = None

    effective_date: _dt.date | None = None
    expiration_date: _dt.date | None = None

    coverage_amount_cents: int | None = None
    premium_cents: int | None = None
    premium_frequency: str | None = None

    deductible_cents: int | None = None
    wind_hail_deductible_pct: Decimal | None = None

    notes: str | None = None

    confidence: str = "low"
    """How much of this came off the page rather than out of interpretation."""

    warnings: list[str] = Field(default_factory=list)
    """Reasons to distrust a specific field, e.g. a premium with no period."""

    unrepresented: list[str] = Field(default_factory=list)
    """Real terms the schema has no column for — liability limits, loss of use,
    a flat named-storm deductible. Dropping these silently would make the policy
    look thinner than it is; the operator can paste them into ``notes`` before
    saving."""
