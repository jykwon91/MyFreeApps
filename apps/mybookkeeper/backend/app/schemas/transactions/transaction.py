import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, model_validator


def _reject_half_a_usage_pair(model: "TransactionCreate | TransactionUpdate"):
    """Mirror the chk_txn_usage_paired DB constraint as a 422, not a 500.

    A quantity with no unit cannot be compared to anything, and a unit with no
    quantity carries no information.
    """
    if (model.usage_quantity is None) != (model.usage_unit is None):
        raise ValueError("usage_quantity and usage_unit must be provided together")
    if model.usage_quantity is not None and model.usage_quantity < 0:
        raise ValueError("usage_quantity must not be negative")
    if (
        model.service_period_start is not None
        and model.service_period_end is not None
        and model.service_period_start > model.service_period_end
    ):
        raise ValueError("service_period_start must not be after service_period_end")
    return model


TransactionType = Literal["income", "expense"]
TransactionStatus = Literal["pending", "approved", "needs_review", "duplicate", "unverified"]
TransactionCategory = Literal[
    "rental_revenue", "cleaning_fee_revenue",
    "maintenance", "contract_work", "cleaning_expense", "utilities",
    "management_fee", "insurance", "mortgage_interest", "mortgage_principal",
    "taxes", "channel_fee", "advertising", "legal_professional", "travel",
    "furnishings", "other_expense", "uncategorized",
]
SubCategory = Literal["electricity", "water", "gas", "internet", "trash", "sewer"]
UsageUnit = Literal["kwh", "therm", "ccf", "mcf", "gallon", "kgal"]
TransactionChannel = Literal["airbnb", "vrbo", "booking.com", "direct"]
PaymentMethod = Literal["check", "credit_card", "bank_transfer", "cash", "platform_payout", "other"]
ScheduleELine = Literal[
    "line_3_rents_received", "line_4_royalties",
    "line_5_advertising", "line_6_auto_travel", "line_7_cleaning_maintenance",
    "line_8_commissions", "line_9_insurance", "line_10_legal_professional",
    "line_12_mortgage_interest", "line_13_other_interest", "line_14_repairs",
    "line_16_taxes", "line_17_utilities", "line_18_depreciation", "line_19_other",
]


class TransactionRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    property_id: uuid.UUID | None = None
    extraction_id: uuid.UUID | None = None
    # Host-curated link to the Vendors rolodex (PR 4.2). NULL for AI-extracted
    # transactions that haven't been manually mapped yet.
    vendor_id: uuid.UUID | None = None
    # Attribution to a tenant applicant
    applicant_id: uuid.UUID | None = None
    attribution_source: str | None = None
    payer_name: str | None = None

    transaction_date: date
    tax_year: int
    vendor: str | None = None
    description: str | None = None

    amount: Decimal
    transaction_type: TransactionType

    category: TransactionCategory
    sub_category: SubCategory | None = None

    # Metered consumption. NULL on non-utility rows and on utility
    # notifications that state only an amount due.
    usage_quantity: Decimal | None = None
    usage_unit: UsageUnit | None = None
    service_period_start: date | None = None
    service_period_end: date | None = None

    tags: list[str] = []
    tax_relevant: bool = False
    schedule_e_line: ScheduleELine | None = None

    is_capital_improvement: bool = False
    placed_in_service_date: date | None = None

    channel: TransactionChannel | None = None
    address: str | None = None
    payment_method: PaymentMethod | None = None

    status: TransactionStatus = "pending"
    review_fields: list[str] | None = None
    review_reason: str | None = None

    reconciled: bool = False
    reconciled_at: datetime | None = None

    is_manual: bool = False

    external_id: str | None = None
    external_source: str | None = None
    is_pending: bool = False

    deleted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    source_document_id: uuid.UUID | None = None
    source_file_name: str | None = None

    linked_document_ids: list[uuid.UUID] = []

    model_config = {"from_attributes": True}


class TransactionCreate(BaseModel):
    property_id: uuid.UUID | None = None
    transaction_date: date
    tax_year: int | None = None
    vendor: str | None = None
    description: str | None = None
    amount: Decimal
    transaction_type: TransactionType
    category: TransactionCategory
    sub_category: SubCategory | None = None
    usage_quantity: Decimal | None = None
    usage_unit: UsageUnit | None = None
    service_period_start: date | None = None
    service_period_end: date | None = None
    tags: list[str] = []
    tax_relevant: bool = False
    schedule_e_line: ScheduleELine | None = None
    is_capital_improvement: bool = False
    placed_in_service_date: date | None = None
    channel: TransactionChannel | None = None
    address: str | None = None
    payment_method: PaymentMethod | None = None

    _check_usage = model_validator(mode="after")(_reject_half_a_usage_pair)


class ScheduleELineItem(BaseModel):
    property_id: uuid.UUID | None
    schedule_e_line: str | None
    total_amount: float


class TransactionUpdate(BaseModel):
    property_id: uuid.UUID | None = None
    # Host-curated link to a Vendors rolodex row (PR 4.2). Explicit null is
    # supported via ``to_update_dict()`` below — the "(none)" option in the
    # frontend dropdown sends ``vendor_id: null`` to detach the link.
    vendor_id: uuid.UUID | None = None
    transaction_date: date | None = None
    tax_year: int | None = None
    vendor: str | None = None
    description: str | None = None
    amount: Decimal | None = None
    transaction_type: TransactionType | None = None
    category: TransactionCategory | None = None
    sub_category: SubCategory | None = None
    # Both halves must be sent together, even when only the quantity changes —
    # a partial patch cannot tell "unit omitted" from "unit cleared", and the
    # DB rejects half a pair.
    usage_quantity: Decimal | None = None
    usage_unit: UsageUnit | None = None
    service_period_start: date | None = None
    service_period_end: date | None = None
    tags: list[str] | None = None
    tax_relevant: bool | None = None
    schedule_e_line: ScheduleELine | None = None
    is_capital_improvement: bool | None = None
    placed_in_service_date: date | None = None
    channel: TransactionChannel | None = None
    address: str | None = None
    payment_method: PaymentMethod | None = None
    status: TransactionStatus | None = None

    _check_usage = model_validator(mode="after")(_reject_half_a_usage_pair)

    def to_update_dict(self) -> dict[str, object]:
        """Return the patch payload for the service layer.

        Most fields drop ``None`` (treating null as "not provided") to
        preserve historical behaviour. ``vendor_id`` is special: an explicit
        ``null`` from the client must reach the service so the FK can be
        unset (PR 4.2 — the Transaction edit page's "Assign vendor" dropdown
        has a "(none)" option that sends ``vendor_id: null``). We detect the
        explicit-null case via ``model_fields_set``.
        """
        payload = self.model_dump(exclude_none=True)
        if "vendor_id" in self.model_fields_set and self.vendor_id is None:
            payload["vendor_id"] = None
        return payload


class TransactionUpdateResponse(TransactionRead):
    retroactive_count: int = 0
