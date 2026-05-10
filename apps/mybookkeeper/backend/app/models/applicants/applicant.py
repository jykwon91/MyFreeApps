"""SQLAlchemy ORM model for ``applicants``.

Per RENTALS_PLAN.md §5.3, §8.1-8.7:
- PII columns (``legal_name``, ``dob``, ``employer_or_hospital``,
  ``vehicle_make_model``) use ``EncryptedString`` so they're stored as Fernet
  ciphertext and round-tripped to plaintext via the type decorator.
- ``key_version`` records which key generation encrypted the row's PII —
  required for non-destructive key rotation per §8.2.
- ``inquiry_id`` is ``ON DELETE SET NULL``: applicants outlive the inquiry
  they came from (the inquiry retention worker may purge older inquiries
  while the applicant is still active in the screening / approval pipeline).
- ``sensitive_purged_at`` is set by the future retention worker (§6.6) when
  PII is NULL'd 1 year after a declined applicant — the row itself is kept
  for funnel analytics, only the PII is purged.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.applicant_enums import APPLICANT_STAGES_SQL
from app.core.encrypted_string_type import EncryptedString
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.leases.signed_lease import SignedLease


class Applicant(Base):
    __tablename__ = "applicants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    inquiry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inquiries.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    # PII — encrypted at rest via EncryptedString TypeDecorator.
    # ``key_version`` (further down) is per-row and covers ALL PII
    # columns below; one rotation re-encrypts the whole row.
    legal_name: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)
    # ``dob`` is stored as ISO-8601 date string so it can be encrypted as text.
    # The repo / service layer is responsible for ISO formatting on write.
    dob: Mapped[str | None] = mapped_column(EncryptedString(50), nullable=True)
    employer_or_hospital: Mapped[str | None] = mapped_column(
        EncryptedString(255), nullable=True,
    )
    vehicle_make_model: Mapped[str | None] = mapped_column(
        EncryptedString(255), nullable=True,
    )
    # Contact channels — copied from inquiries.inquirer_email /
    # inquirer_phone on inquiry → applicant promotion (see
    # promote_service). Named ``contact_*`` (not bare ``email``/``phone``)
    # so the audit-mask global field-name match doesn't collide with
    # users.email which is intentionally plaintext for login.
    contact_email: Mapped[str | None] = mapped_column(
        EncryptedString(255), nullable=True,
    )
    contact_phone: Mapped[str | None] = mapped_column(
        EncryptedString(50), nullable=True,
    )

    # Opaque MinIO key — NOT encrypted (key reveals nothing about contents).
    id_document_storage_key: Mapped[str | None] = mapped_column(
        String(500), nullable=True,
    )

    contract_start: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)
    # ``contract_end`` is no longer stored — it's derived from the latest
    # non-deleted signed lease's ``ends_on`` via the ``contract_end``
    # property below. Pre-signature there is no lease, so the value is
    # ``None`` (the host enters the end date when creating the lease).
    # The frontend continues to display ``contract_end`` as a read-only
    # field surfaced through the response schemas.

    smoker: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    pets: Mapped[str | None] = mapped_column(Text, nullable=True)
    referred_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    stage: Mapped[str] = mapped_column(
        String(40), nullable=False, default="lead", server_default="lead",
    )

    # Tenant lifecycle — set when the host manually ends a tenancy. Cleared
    # on restart. A tenant is also considered ended if contract_end < today
    # (computed at read-time; no background job needed).
    tenant_ended_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    tenant_ended_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    key_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1",
    )

    deleted_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    # Set by the retention worker (out of scope for PR 3.1a) once PII has been
    # NULL'd post-decline. Lets us distinguish "soft-deleted but still has PII"
    # from "soft-deleted and PII has been purged" without a separate flag.
    sensitive_purged_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        onupdate=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    # All signed leases for this applicant. Ordered descending by
    # ``ends_on`` so ``signed_leases[0]`` is the latest term — the
    # source of the derived ``contract_end`` below. Read paths that
    # surface ``contract_end`` MUST eager-load this relationship
    # (``selectinload(Applicant.signed_leases)``) — without the load
    # the property silently returns ``None``.
    signed_leases: Mapped[list["SignedLease"]] = relationship(
        "SignedLease",
        primaryjoin=(
            "and_(Applicant.id == foreign(SignedLease.applicant_id), "
            "SignedLease.deleted_at.is_(None))"
        ),
        order_by="SignedLease.ends_on.desc().nullslast()",
        viewonly=True,
        lazy="select",
    )

    @property
    def contract_end(self) -> _dt.date | None:
        """Latest non-deleted signed lease's ``ends_on`` for this applicant.

        Returns ``None`` when:
        - no signed lease exists yet (pre-signature),
        - no signed lease has an ``ends_on`` populated, OR
        - the ``signed_leases`` relationship has not been eager-loaded —
          we deliberately do NOT trigger a lazy-load here because the
          ORM is wired to an async session and a sync lazy-load raises
          ``MissingGreenlet``. Callers must ``selectinload`` to get a
          non-None result.

        The relationship is ordered ``ends_on DESC NULLS LAST`` so the
        head row is the latest.
        """
        state = sa_inspect(self)
        if "signed_leases" not in state.dict:
            return None
        for lease in self.signed_leases:
            if lease.ends_on is not None:
                return lease.ends_on
        return None

    __table_args__ = (
        CheckConstraint(
            f"stage IN {APPLICANT_STAGES_SQL}",
            name="chk_applicant_stage",
        ),
        # Pipeline stage filter — covers (org, stage) for active rows.
        Index(
            "ix_applicants_org_stage_active",
            "organization_id", "stage",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # Pipeline sort — newest first.
        Index(
            "ix_applicants_org_created_active",
            "organization_id", "created_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # "Find applicant from inquiry" lookup (used by promotion service).
        Index(
            "ix_applicants_org_inquiry",
            "organization_id", "inquiry_id",
        ),
        # Retention purge worker scan (RENTALS_PLAN.md §6.6) — finds
        # soft-deleted rows whose PII has not yet been purged.
        Index(
            "ix_applicants_user_pending_purge",
            "user_id", "deleted_at",
            postgresql_where=text(
                "deleted_at IS NOT NULL AND sensitive_purged_at IS NULL",
            ),
        ),
    )
