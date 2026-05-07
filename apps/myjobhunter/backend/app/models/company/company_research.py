import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CompanyResearch(Base):
    __tablename__ = "company_research"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    overall_sentiment: Mapped[str] = mapped_column(String(20), default="unknown")
    senior_engineer_sentiment: Mapped[str | None] = mapped_column(Text, nullable=True)
    interview_process: Mapped[str | None] = mapped_column(Text, nullable=True)

    # What the company does — products, business model, customers.
    # Synthesised from a Tavily search without the review-site domain
    # filter so company-info sources (official site, news, wikipedia,
    # crunchbase) can land in the prompt context.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Personalised: which of the company's products / teams / role
    # families align with the requesting user's resume background.
    # Synthesised by passing the user's profile summary + recent roles
    # + top skills into the Claude prompt alongside the company
    # context. Null when the user has no resume content uploaded.
    products_for_you: Mapped[str | None] = mapped_column(Text, nullable=True)

    red_flags: Mapped[list[str]] = mapped_column(
        ARRAY(Text),
        default=list,
        server_default="{}",
    )
    green_flags: Mapped[list[str]] = mapped_column(
        ARRAY(Text),
        default=list,
        server_default="{}",
    )

    reported_comp_range_min: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    reported_comp_range_max: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    comp_currency: Mapped[str] = mapped_column(String(3), default="USD")
    comp_confidence: Mapped[str] = mapped_column(String(10), default="unknown")

    raw_synthesis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    last_researched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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

    company: Mapped["Company"] = relationship("Company", back_populates="research")
    sources: Mapped[list["ResearchSource"]] = relationship("ResearchSource", back_populates="company_research", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "overall_sentiment IN ('positive','mixed','negative','unknown')",
            name="chk_company_research_sentiment",
        ),
        CheckConstraint(
            "comp_confidence IN ('high','medium','low','unknown')",
            name="chk_company_research_comp_confidence",
        ),
        CheckConstraint(
            "cardinality(red_flags) <= 20",
            name="chk_company_research_red_flags_max",
        ),
        CheckConstraint(
            "cardinality(green_flags) <= 20",
            name="chk_company_research_green_flags_max",
        ),
        Index("uq_company_research_company", "company_id", unique=True),
    )
