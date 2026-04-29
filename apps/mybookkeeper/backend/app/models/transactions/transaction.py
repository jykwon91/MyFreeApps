import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index,
    Integer, Numeric, SmallInteger, String, Text, text,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.db.base import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    property_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True)
    activity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("activities.id", ondelete="SET NULL"), nullable=True)
    extraction_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("extractions.id", ondelete="SET NULL"), nullable=True)
    # Host-curated link to a row in the Vendors rolodex (PR 4.2 / RENTALS_PLAN.md §5.4).
    # ON DELETE SET NULL — hard-deleting a vendor preserves transaction history.
    # The free-text ``vendor`` column above stays as the AI-extracted name; this
    # FK is the host's manual mapping. No backref on Vendor — keeps the model
    # one-directional to avoid accidental N+1 traps.
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vendors.id", ondelete="SET NULL", name="fk_txn_vendor"),
        nullable=True,
    )

    transaction_date: Mapped[date] = mapped_column(Date)
    tax_year: Mapped[int] = mapped_column(SmallInteger)
    vendor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    normalized_vendor: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    transaction_type: Mapped[str] = mapped_column(String(10))

    category: Mapped[str] = mapped_column(String(50))
    sub_category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    tax_relevant: Mapped[bool] = mapped_column(Boolean, default=False)
    schedule_e_line: Mapped[str | None] = mapped_column(String(50), nullable=True)

    is_capital_improvement: Mapped[bool] = mapped_column(Boolean, default=False)
    placed_in_service_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    channel: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="pending")
    review_fields: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    review_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    reconciled: Mapped[bool] = mapped_column(Boolean, default=False)
    reconciled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    is_manual: Mapped[bool] = mapped_column(Boolean, default=False)

    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_pending: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    duplicate_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("amount > 0", name="chk_txn_amount_positive"),
        CheckConstraint(
            "transaction_type IN ('income', 'expense')",
            name="chk_txn_type",
        ),
        CheckConstraint(
            "status IN ('pending', 'approved', 'needs_review', 'duplicate', 'unverified')",
            name="chk_txn_status",
        ),
        CheckConstraint(
            "category IN ("
            "'rental_revenue', 'cleaning_fee_revenue', 'business_income', "
            "'maintenance', 'contract_work', 'cleaning_expense', 'utilities', "
            "'management_fee', 'insurance', 'mortgage_interest', 'mortgage_principal', "
            "'taxes', 'channel_fee', 'advertising', 'legal_professional', 'travel', "
            "'furnishings', 'other_expense', 'uncategorized', 'security_deposit', "
            "'supplies', 'home_office', 'meals', 'vehicle_expenses', "
            "'health_insurance', 'education_training'"
            ")",
            name="chk_txn_category",
        ),
        CheckConstraint(
            "channel IS NULL OR channel IN ('airbnb', 'vrbo', 'booking.com', 'direct')",
            name="chk_txn_channel",
        ),
        CheckConstraint(
            "payment_method IS NULL OR payment_method IN ("
            "'check', 'credit_card', 'bank_transfer', 'cash', 'platform_payout', 'other'"
            ")",
            name="chk_txn_payment",
        ),
        CheckConstraint(
            "schedule_e_line IS NULL OR schedule_e_line IN ("
            "'line_3_rents_received', 'line_4_royalties', "
            "'line_5_advertising', 'line_6_auto_travel', 'line_7_cleaning_maintenance', "
            "'line_8_commissions', 'line_9_insurance', 'line_10_legal_professional', "
            "'line_12_mortgage_interest', 'line_13_other_interest', 'line_14_repairs', "
            "'line_16_taxes', 'line_17_utilities', 'line_18_depreciation', 'line_19_other'"
            ")",
            name="chk_txn_schedule_e",
        ),
        CheckConstraint(
            "tax_year >= 2020 AND tax_year <= 2099",
            name="chk_txn_tax_year",
        ),
        CheckConstraint(
            "NOT is_capital_improvement OR placed_in_service_date IS NOT NULL",
            name="chk_txn_capital",
        ),
        CheckConstraint(
            "(transaction_type = 'income' AND category IN ("
            "'rental_revenue', 'cleaning_fee_revenue', 'business_income', "
            "'uncategorized', 'security_deposit'"
            ")) OR "
            "(transaction_type = 'expense' AND category NOT IN ("
            "'rental_revenue', 'cleaning_fee_revenue', 'business_income', 'security_deposit'"
            "))",
            name="chk_txn_type_category",
        ),
        Index(
            "ix_txn_org_date", "organization_id", "transaction_date",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_txn_org_property_date", "organization_id", "property_id", "transaction_date",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_txn_org_type_date", "organization_id", "transaction_type", "transaction_date",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_txn_org_category_date", "organization_id", "category", "transaction_date",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_txn_org_status", "organization_id", "status",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_txn_org_activity_date", "organization_id", "activity_id", "transaction_date",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_txn_extraction", "extraction_id"),
        Index(
            "ix_txn_org_tax_year", "organization_id", "tax_year",
            postgresql_where=text("deleted_at IS NULL AND status = 'approved'"),
        ),
        Index(
            "ix_txn_org_reconciled", "organization_id", "reconciled",
            postgresql_where=text("deleted_at IS NULL AND reconciled = false"),
        ),
        Index(
            "ix_txn_summary", "organization_id", "transaction_date", "transaction_type", "category",
            postgresql_where=text("deleted_at IS NULL AND status = 'approved'"),
        ),
        Index(
            "uq_txn_external", "organization_id", "external_source", "external_id",
            unique=True,
            postgresql_where=text("external_id IS NOT NULL"),
        ),
        Index(
            "ix_txn_dedup_lookup", "organization_id", "amount", "transaction_type",
            postgresql_where=text("deleted_at IS NULL AND status != 'duplicate'"),
        ),
        CheckConstraint(
            "sub_category IS NULL OR sub_category IN ("
            "'electricity', 'water', 'gas', 'internet', 'trash', 'sewer'"
            ")",
            name="chk_txn_sub_category",
        ),
        Index(
            "ix_txn_utility_trends",
            "organization_id", "sub_category", "property_id", "transaction_date",
            postgresql_where=text(
                "deleted_at IS NULL AND category = 'utilities' AND sub_category IS NOT NULL"
            ),
        ),
        # Partial index on the vendor FK — most transactions have no vendor
        # link, so indexing only the populated rows keeps the index lean.
        # Ships in migration ``h0j2k5m7n9p1`` (PR 4.2).
        Index(
            "ix_txn_vendor_id_partial", "vendor_id",
            postgresql_where=text("vendor_id IS NOT NULL"),
        ),
    )

    organization = relationship("Organization")
    user = relationship("User")
    linked_property = relationship("Property")
    activity = relationship("Activity")
    extraction = relationship("Extraction")
    # Forward-only relationship to the Vendors rolodex entry. Deliberately no
    # backref on Vendor — see vendor_id column docstring.
    vendor_rolodex_entry = relationship("Vendor", lazy="noload")
    linked_documents = relationship("TransactionDocument", back_populates="transaction", lazy="noload")

    @hybrid_property
    def source_document_id(self) -> object:
        if self.extraction:
            return self.extraction.document_id
        try:
            if self.linked_documents:
                return self.linked_documents[0].document_id
        except Exception:
            pass
        return None

    @hybrid_property
    def source_file_name(self) -> str | None:
        if self.extraction and self.extraction.document:
            return self.extraction.document.file_name
        try:
            if self.linked_documents and self.linked_documents[0].document:
                return self.linked_documents[0].document.file_name
        except Exception:
            pass
        return None


from sqlalchemy import event as _sa_event
from app.core.vendors import normalize_vendor as _normalize


@_sa_event.listens_for(Transaction, "init")
@_sa_event.listens_for(Transaction, "load")
def _set_normalized_vendor(target: Transaction, *_args, **_kwargs) -> None:
    if target.vendor is not None and not target.normalized_vendor:
        target.normalized_vendor = _normalize(target.vendor)


@_sa_event.listens_for(Transaction.vendor, "set")
def _vendor_changed(_target: Transaction, value: str | None, _oldvalue, _initiator) -> None:
    _target.normalized_vendor = _normalize(value) if value else None
