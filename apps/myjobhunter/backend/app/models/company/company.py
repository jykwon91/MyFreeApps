import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    primary_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size_range: Mapped[str | None] = mapped_column(String(20), nullable=True)
    hq_location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    crunchbase_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

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

    research: Mapped["CompanyResearch | None"] = relationship("CompanyResearch", back_populates="company", uselist=False, cascade="all, delete-orphan")
    applications: Mapped[list["Application"]] = relationship("Application", back_populates="company")

    __table_args__ = (
        CheckConstraint(
            "size_range IS NULL OR size_range IN ('1-10','11-50','51-200','201-1000','1001-5000','5000+')",
            name="chk_company_size_range",
        ),
        CheckConstraint(
            "primary_domain IS NULL OR primary_domain = lower(primary_domain)",
            name="chk_company_domain_lowercase",
        ),
        Index(
            "uq_company_user_domain",
            "user_id",
            text("lower(primary_domain)"),
            unique=True,
            postgresql_where=text("primary_domain IS NOT NULL"),
        ),
    )
