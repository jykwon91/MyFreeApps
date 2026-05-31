"""ORM model for ``payer_alias`` — learned payer → tenant associations.

When the host confirms a fuzzy/unmatched payment against a tenant, or manually
links one, the (normalized) ``payer_name`` — plus the payer's stable sender
handle when the payment notification exposed one — is remembered here so future
payments from that payer auto-attribute without review. This realizes the
"I'll remember that" promise the Payment Review UI already shows.

The alias is keyed on ``(organization_id, normalized_payer_name, payer_handle,
applicant_id)``. Allowing more than one row per name is deliberate:

  - **Two different people who share a name** each get their own row,
    disambiguated by ``payer_handle`` (Zelle email/phone, Venmo @user, Cash
    App $tag). An incoming payment carrying that handle resolves to the right
    tenant.
  - **A name confirmed to two distinct tenants WITHOUT a distinguishing
    handle** leaves two rows. The matcher (``attribution_matcher.resolve_alias``)
    reads that as *ambiguous* and routes the payment to review instead of
    silently attributing to whichever same-named tenant happened to be aliased
    first — the same wrong-attribution guard ``find_best_match`` applies on the
    name-match side.

``payer_handle`` is the empty string (never NULL) when no handle was captured,
so it participates in the unique key with identical semantics on SQLite (tests)
and PostgreSQL (prod) — NULL uniqueness differs between the two engines.
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
    # Stable sender handle (Zelle email/phone, Venmo @user, Cash App $tag),
    # normalized to lower().strip(). The empty string — never NULL — means "no
    # handle captured", so this column always carries a concrete value in the
    # unique key below (NULL uniqueness semantics differ between SQLite and
    # PostgreSQL). Used to disambiguate two different people who share a name.
    payer_handle: Mapped[str] = mapped_column(
        String(255), nullable=False, default="", server_default=""
    )

    # The tenant this payer pays for. CASCADE: a deleted applicant's aliases
    # are meaningless, so they go with it.
    applicant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("applicants.id", ondelete="CASCADE"), nullable=False)

    # How the alias was learned: "confirm" (review-queue confirm) or
    # "manual_link" (host picked a tenant via the unmatched picker).
    source: Mapped[str] = mapped_column(String(20), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        # One row per (org, payer name, handle, tenant). A name may map to more
        # than one tenant — disambiguated by handle, or left ambiguous (→
        # review) when no handle distinguishes them. Re-confirming the SAME
        # (name, handle) to the SAME tenant touches the existing row. The
        # leftmost (organization_id, normalized_payer_name) prefix serves the
        # Pass-0 list lookup and org-only scans, so no separate index is needed.
        UniqueConstraint(
            "organization_id",
            "normalized_payer_name",
            "payer_handle",
            "applicant_id",
            name="uq_payer_alias_org_name_handle_applicant",
        ),
        CheckConstraint(
            "source IN ('confirm', 'manual_link')",
            name="chk_payer_alias_source",
        ),
        # Postgres does not auto-index FKs; index applicant_id for the CASCADE
        # delete and reverse lookups.
        Index("ix_payer_alias_applicant_id", "applicant_id"),
    )

    applicant = relationship("Applicant", lazy="noload")
