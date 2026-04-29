import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


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

    transaction_date: date
    tax_year: int
    vendor: str | None = None
    description: str | None = None

    amount: Decimal
    transaction_type: TransactionType

    category: TransactionCategory
    sub_category: SubCategory | None = None
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
    tags: list[str] = []
    tax_relevant: bool = False
    schedule_e_line: ScheduleELine | None = None
    is_capital_improvement: bool = False
    placed_in_service_date: date | None = None
    channel: TransactionChannel | None = None
    address: str | None = None
    payment_method: PaymentMethod | None = None


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
    tags: list[str] | None = None
    tax_relevant: bool | None = None
    schedule_e_line: ScheduleELine | None = None
    is_capital_improvement: bool | None = None
    placed_in_service_date: date | None = None
    channel: TransactionChannel | None = None
    address: str | None = None
    payment_method: PaymentMethod | None = None
    status: TransactionStatus | None = None

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
