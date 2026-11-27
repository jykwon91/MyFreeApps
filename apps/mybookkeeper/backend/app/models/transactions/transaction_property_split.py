import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TransactionPropertySplit(Base):
    """One property's share of a transaction that is split across properties.

    A split transaction has two or more of these, their amounts adding up to
    the transaction's amount, and no ``property_id`` of its own: the shares are
    the only record of which properties it belongs to. Every per-property
    figure reads the shares in place of the transaction's property (see
    ``repositories/transactions/property_allocation``). Scoped to an
    organization through its transaction, like ``transaction_documents``.

    Deleting the property keeps the share with no property (SET NULL), so the
    amount stays counted, as unassigned, instead of vanishing from the totals.
    """

    __tablename__ = "transaction_property_splits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False,
    )
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False,
    )

    __table_args__ = (
        CheckConstraint("amount > 0", name="chk_txn_split_amount_positive"),
        UniqueConstraint("transaction_id", "property_id", name="uq_txn_split_property"),
        Index("ix_txn_split_property", "property_id"),
    )

    transaction = relationship("Transaction", back_populates="property_splits")
