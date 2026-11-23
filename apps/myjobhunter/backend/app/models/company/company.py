import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    event,
    func,
    inspect,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.core.company_domain import normalize_company_domain
from app.core.company_research_constants import COMPANY_NON_EDIT_COLUMNS
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.application.application import Application
    from app.models.company.company_research import CompanyResearch


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

    # Claim on a research run in flight (Tavily + Claude), so the same company
    # isn't researched twice at once. Set and cleared in short transactions
    # (no connection is held during the run); older than
    # COMPANY_RESEARCH_CLAIM_LEASE it is stale (a crashed run) and can be retaken.
    research_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        # Stamped by ``_stamp_updated_at`` below, not ``onupdate``: a research
        # claim must leave it alone, and an ORM flush can't skip an onupdate.
    )

    research: Mapped["CompanyResearch | None"] = relationship("CompanyResearch", back_populates="company", uselist=False, cascade="all, delete-orphan")
    applications: Mapped[list["Application"]] = relationship(
        "Application",
        back_populates="company",
        # applications.company_id is ON DELETE RESTRICT: let the database enforce it
        # instead of the ORM trying to NULL the (non-null) FK on delete.
        passive_deletes="all",
    )

    @validates("primary_domain")
    def _normalize_primary_domain(self, _key: str, value: str | None) -> str | None:
        """Every ORM write stores the normalised host (see ``app.core.company_domain``)."""
        return normalize_company_domain(value)

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


@event.listens_for(Company, "before_update")
def _stamp_updated_at(_mapper: object, _connection: object, company: Company) -> None:
    """Stamp ``updated_at`` when a flush edits the company.

    A flush that only takes, renews or releases the research claim is not an
    edit, so ``updated_at`` (and its audit history) stays as it was. A caller
    that sets ``updated_at`` itself keeps its value.
    """
    state = inspect(company)
    if state.attrs.updated_at.history.has_changes():
        return
    if any(
        state.attrs[attr.key].history.has_changes()
        for attr in inspect(Company).column_attrs
        if attr.key not in COMPANY_NON_EDIT_COLUMNS
    ):
        company.updated_at = datetime.now(timezone.utc)
