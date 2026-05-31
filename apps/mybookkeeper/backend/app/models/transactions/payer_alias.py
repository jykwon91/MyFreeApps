"""ORM model for ``payer_alias`` — learned payer → tenant associations.

When the host confirms a fuzzy/unmatched payment against a tenant, or manually
links one, the (normalized) ``payer_name`` is remembered here so future
payments from that payer auto-attribute without review. This realizes the
"I'll remember that" promise the Payment Review UI already shows.

The alias is keyed on the **normalized payer name** within an organization
(one alias per name per org — a re-confirm to a different tenant upserts the
target). Keying on a stable sender handle (Zelle email/phone) for same-name
payers is a future enhancement (``payer_handle`` is reserved for it but not yet
populated); until then the matcher treats a name confirmed to two tenants as
ambiguous via the auto-match guard rather than aliasing it.
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
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PayerAlias(Base):
    __tablename__ = "payer_alias"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)

    # The payer name, lower-cased + whitespace-stripped (matches the matcher's
    # own normalization in attribution_service). This is what an incoming
    # payment's payer_name is normalized to and looked up against.
    normalized_payer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Reserved for a stable sender handle (Zelle email/phone) so two different
    # people sharing a name can be disambiguated. Not yet populated — see PR3
    # in TECH_DEBT.md ("2026-05-30 — Payment Review").
    payer_handle: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # The tenant this payer pays for. CASCADE: a deleted applicant's aliases
    # are meaningless, so they go with it.
    applicant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("applicants.id", ondelete="CASCADE"), nullable=False)

    # How the alias was learned: "confirm" (review-queue confirm) or
    # "manual_link" (host picked a tenant via the unmatched picker).
    source: Mapped[str] = mapped_column(String(20), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        # One learned alias per payer name per org; re-confirming a payer to a
        # different tenant upserts the target (latest confirmation wins). The
        # unique index also serves the Pass-0 lookup (organization_id,
        # normalized_payer_name) and org-only scans via leftmost prefix — no
        # separate index needed for those.
        UniqueConstraint("organization_id", "normalized_payer_name", name="uq_payer_alias_org_name"),
        CheckConstraint(
            "source IN ('confirm', 'manual_link')",
            name="chk_payer_alias_source",
        ),
        # Postgres does not auto-index FKs; index applicant_id for the CASCADE
        # delete and reverse lookups.
        Index("ix_payer_alias_applicant_id", "applicant_id"),
    )

    applicant = relationship("Applicant", lazy="noload")
