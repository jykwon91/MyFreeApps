"""Schema for the body of ``POST /mortgages/extract``.

Deliberately NOT a ``MortgageCreateRequest``. A draft is what a document
appeared to say; a create request is what the operator asserts is true.

The difference that matters most here is ``rate_type``. The stored row requires
it and the create request has no default, because whether a rate can move
decides whether the loan can be benchmarked at all. A draft is allowed to leave
it null — a statement that never says is a statement that never says, and the
form asking one question beats a reader inventing an answer.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, Field


class MortgageDraft(BaseModel):
    """A loan as read from a statement — not yet saved, not yet validated."""

    source_document_id: uuid.UUID

    lender: str | None = None
    account_number: str | None = None

    current_balance_cents: int | None = None
    statement_date: _dt.date | None = None
    original_principal_cents: int | None = None

    interest_rate: Decimal | None = None
    rate_type: str | None = None
    fixed_until: _dt.date | None = None

    maturity_date: _dt.date | None = None
    term_months: int | None = None

    monthly_principal_cents: int | None = None
    monthly_interest_cents: int | None = None
    monthly_escrow_cents: int | None = None

    notes: str | None = None

    confidence: str = "low"
    """How much of this came off the page rather than out of interpretation."""

    warnings: list[str] = Field(default_factory=list)
    """Reasons to distrust a specific field, e.g. a rate with no stated term."""

    unrepresented: list[str] = Field(default_factory=list)
    """Real terms the schema has no column for — a prepayment penalty, an
    escrow shortage, a temporary buydown. Dropping these silently would make
    the loan look simpler than it is."""
