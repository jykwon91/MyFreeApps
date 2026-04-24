import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    role_title: Mapped[str] = mapped_column(String(200), nullable=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    jd_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    jd_parsed: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    source: Mapped[str | None] = mapped_column(String(20), nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    posted_salary_min: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    posted_salary_max: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    posted_salary_currency: Mapped[str] = mapped_column(String(3), default="USD")
    posted_salary_period: Mapped[str | None] = mapped_column(String(10), nullable=True)

    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    remote_type: Mapped[str] = mapped_column(String(20), default="unknown")

    fit_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)

    external_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    company: Mapped["Company"] = relationship("Company", back_populates="applications")
    events: Mapped[list["ApplicationEvent"]] = relationship("ApplicationEvent", back_populates="application", cascade="all, delete-orphan")
    contacts: Mapped[list["ApplicationContact"]] = relationship("ApplicationContact", back_populates="application", cascade="all, delete-orphan")
    documents: Mapped[list["Document"]] = relationship("Document", back_populates="application", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "source IS NULL OR source IN ('indeed','linkedin','ziprecruiter','greenhouse','lever','workday','direct','referral','chrome_extension','other')",
            name="chk_application_source",
        ),
        CheckConstraint(
            "posted_salary_period IS NULL OR posted_salary_period IN ('annual','hourly','monthly')",
            name="chk_application_salary_period",
        ),
        CheckConstraint(
            "remote_type IN ('remote','hybrid','onsite','unknown')",
            name="chk_application_remote_type",
        ),
        CheckConstraint(
            "fit_score IS NULL OR (fit_score >= 0 AND fit_score <= 100)",
            name="chk_application_fit_score",
        ),
        Index(
            "ix_application_user_archived_applied",
            "user_id",
            "applied_at",
            postgresql_where=text("archived = false AND deleted_at IS NULL"),
        ),
        Index(
            "uq_application_user_role",
            "user_id",
            "company_id",
            text("lower(role_title)"),
            text("coalesce(url, '')"),
            unique=True,
            postgresql_where=text("archived = false AND deleted_at IS NULL"),
        ),
    )
