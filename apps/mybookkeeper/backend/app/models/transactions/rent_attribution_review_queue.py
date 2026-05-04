"""ORM model for ``rent_attribution_review_queue``.

Rows land here when the attribution pipeline cannot auto-confirm which
applicant sent a payment — either because the name match was fuzzy
(edit distance ≤ 2) or because no applicant matched at all.

The host reviews each row via the UI, choosing confirm / reject / pick.
On confirm the transaction is updated atomically and the row is resolved.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class RentAttributionReviewQueue(Base):
    __tablename__ = "rent_attribution_review_queue"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    transaction_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    proposed_applicant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("applicants.id", ondelete="SET NULL"), nullable=True)

    # "fuzzy" = Levenshtein ≤ 2 candidate found; "unmatched" = no candidate
    confidence: Mapped[str] = mapped_column(String(10), nullable=False)
    # "pending" → "confirmed" or "rejected" when the host reviews
    status: Mapped[str] = mapped_column(String(15), nullable=False, default="pending", server_default="pending")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("transaction_id", name="uq_rarq_transaction"),
        CheckConstraint(
            "confidence IN ('fuzzy', 'unmatched')",
            name="chk_rarq_confidence",
        ),
        CheckConstraint(
            "status IN ('pending', 'confirmed', 'rejected')",
            name="chk_rarq_status",
        ),
        Index(
            "ix_rarq_org_status",
            "organization_id", "status",
            postgresql_where=text("deleted_at IS NULL AND status = 'pending'"),
        ),
        Index("ix_rarq_transaction", "transaction_id"),
        Index("ix_rarq_org_id", "organization_id"),
    )

    transaction = relationship("Transaction", lazy="noload")
    proposed_applicant = relationship("Applicant", lazy="noload")
