"""Pydantic schemas for the rent-attribution review queue and dashboard P&L."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Attribution review queue
# ---------------------------------------------------------------------------

class AttributionTransactionSummary(BaseModel):
    """Slim transaction view for the review queue."""
    id: uuid.UUID
    transaction_date: date
    amount: Decimal
    vendor: str | None = None
    payer_name: str | None = None
    description: str | None = None
    property_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class AttributionApplicantSummary(BaseModel):
    """Slim applicant view for the review queue."""
    id: uuid.UUID
    legal_name: str | None = None

    model_config = {"from_attributes": True}


class AttributionReviewItemRead(BaseModel):
    id: uuid.UUID
    transaction_id: uuid.UUID
    proposed_applicant_id: uuid.UUID | None = None
    confidence: str
    status: str
    created_at: datetime
    resolved_at: datetime | None = None
    transaction: AttributionTransactionSummary | None = None
    proposed_applicant: AttributionApplicantSummary | None = None

    model_config = {"from_attributes": True}


class AttributionReviewQueueResponse(BaseModel):
    items: list[AttributionReviewItemRead]
    total: int
    pending_count: int


class ConfirmReviewRequest(BaseModel):
    model_config = {"extra": "forbid"}
    # Optionally override the suggested applicant (for "pick a different tenant")
    applicant_id: uuid.UUID | None = None


class AttributeManuallyRequest(BaseModel):
    model_config = {"extra": "forbid"}
    applicant_id: uuid.UUID


# ---------------------------------------------------------------------------
# Property P&L dashboard
# ---------------------------------------------------------------------------

class ExpenseBreakdown(BaseModel):
    category: str
    amount_cents: int


class PropertyPnLEntry(BaseModel):
    property_id: uuid.UUID
    name: str
    revenue_cents: int
    expenses_cents: int
    net_cents: int
    expense_breakdown: list[ExpenseBreakdown]


class PropertyPnLResponse(BaseModel):
    since: date
    until: date
    properties: list[PropertyPnLEntry]
    total_revenue_cents: int
    total_expenses_cents: int
    total_net_cents: int
