import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index, String, text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class TaxFormInstance(Base):
    __tablename__ = "tax_form_instances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tax_return_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tax_returns.id", ondelete="CASCADE"))
    form_name: Mapped[str] = mapped_column(String(50))
    instance_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_type: Mapped[str] = mapped_column(String(20))
    document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    extraction_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("extractions.id", ondelete="SET NULL"), nullable=True)
    property_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True)
    activity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("activities.id", ondelete="SET NULL"), nullable=True)

    issuer_ein: Mapped[str | None] = mapped_column(String(20), nullable=True)
    issuer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint(
            "source_type IN ('extracted', 'computed', 'manual')",
            name="chk_tfi_source",
        ),
        CheckConstraint(
            "status IN ('draft', 'validated', 'flagged', 'locked')",
            name="chk_tfi_status",
        ),
        CheckConstraint(
            "form_name IN ("
            "'w2', '1099_int', '1099_div', '1099_b', '1099_k', "
            "'1099_misc', '1099_nec', '1099_r', '1098', 'k1', "
            "'1040', 'schedule_1', 'schedule_2', 'schedule_3', "
            "'schedule_a', 'schedule_b', 'schedule_c', 'schedule_d', "
            "'schedule_e', 'schedule_se', "
            "'form_8949', 'form_4562', 'form_4797', "
            "'form_8582', 'form_8960', 'form_8995'"
            ")",
            name="chk_tfi_form",
        ),
        Index("ix_tfi_return_form", "tax_return_id", "form_name"),
        Index(
            "ix_tfi_document", "document_id",
            postgresql_where=text("document_id IS NOT NULL"),
        ),
    )

    tax_return = relationship("TaxReturn", back_populates="form_instances")
    document = relationship("Document")
    extraction = relationship("Extraction")
    property = relationship("Property")
    activity = relationship("Activity")
    fields = relationship("TaxFormField", back_populates="form_instance", cascade="all, delete-orphan")
