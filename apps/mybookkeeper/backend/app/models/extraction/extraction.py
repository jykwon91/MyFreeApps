import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint, ForeignKey, Index, Integer, String, DateTime, Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.db.base import Base


class Extraction(Base):
    __tablename__ = "extractions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"))
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)

    status: Mapped[str] = mapped_column(String(20), default="processing")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    raw_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    confidence: Mapped[str | None] = mapped_column(String(20), nullable=True)
    document_type: Mapped[str] = mapped_column(String(50), default="invoice")
    model_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint(
            "status IN ('processing', 'completed', 'failed')",
            name="chk_ext_status",
        ),
        CheckConstraint(
            "confidence IN ('high', 'medium', 'low')",
            name="chk_ext_confidence",
        ),
        CheckConstraint(
            "document_type IN ("
            "'invoice', 'statement', 'lease', 'insurance_policy', "
            "'tax_form', 'contract', 'year_end_statement', 'receipt', '1099', 'other', "
            "'w2', '1099_int', '1099_div', '1099_b', '1099_k', "
            "'1099_misc', '1099_nec', '1099_r', '1098', 'k1'"
            ")",
            name="chk_ext_doc_type",
        ),
        Index("ix_ext_document", "document_id", text("created_at DESC")),
        Index("ix_ext_org_status", "organization_id", "status"),
    )

    document = relationship("Document")
    user = relationship("User")
