import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TransactionDocument(Base):
    __tablename__ = "transaction_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"))
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"))
    extraction_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("extractions.id", ondelete="SET NULL"), nullable=True)
    link_type: Mapped[str] = mapped_column(String(20), default="duplicate_source")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("transaction_id", "document_id", name="uq_txn_doc"),
        CheckConstraint(
            "link_type IN ('duplicate_source', 'corroborating', 'manual')",
            name="chk_txn_doc_link_type",
        ),
        Index("ix_txn_doc_transaction", "transaction_id"),
        Index("ix_txn_doc_document", "document_id"),
    )

    transaction = relationship("Transaction", back_populates="linked_documents")
    document = relationship("Document")
    extraction = relationship("Extraction")
