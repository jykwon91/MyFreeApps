"""ORM model for ``utility_account_link`` — learned utility account → property.

Utility "bill is ready / due" notification emails (AT&T, City of Houston Water,
CenterPoint, etc.) carry an ACCOUNT NUMBER and an AMOUNT but NO service
address, so the address matcher in ``property_matcher_service`` cannot tie them
to a property. This table remembers the mapping the first time it CAN be
resolved — from an explicit property pick, or from an address-matched bill that
also exposes the account number — keyed on ``(sender_domain, account_number)``.
Future thin notifications from the same provider account then resolve to the
right property without an address.

The link is keyed on ``(organization_id, sender_domain, account_number)``:

  - ``sender_domain`` is the registrable domain of the From address, lowercased
    and collapsed past provider sub-mailers (``emailff.att-mail.com`` and
    ``emaildl.att-mail.com`` both → ``att-mail.com``) so a single provider maps
    to a single key regardless of which mailer host sent the notification.
  - ``account_number`` is stored in PLAINTEXT (not ``EncryptedString``) — the
    lookup is an equality match, and Fernet ciphertext is non-deterministic, so
    an encrypted column would never match on read. It is normalized (upper,
    spaces/dashes/dots stripped) identically on learn-write and lookup.

``source`` records how the link was learned: ``auto_learn`` (derived during
extraction when an address-matched or explicitly-picked bill exposed an account
number) or ``manual_link`` (a future UI where the host picks the property
directly). A ``manual_link`` row is authoritative and is never clobbered by a
later ``auto_learn`` write — that rule lives in
``utility_account_service.learn_account_link``.
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


class UtilityAccountLink(Base):
    __tablename__ = "utility_account_link"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    # user_id is indexed via the explicit ``ix_utility_link_user_id`` in
    # __table_args__ (FK CASCADE perf), not a column-level index, to avoid two
    # indexes on the same column.
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # The property this provider account bills for. CASCADE: a deleted property's
    # account links are meaningless, so they go with it.
    property_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False)

    # The provider's registrable domain, lowercased + sub-mailer-collapsed (e.g.
    # "att-mail.com"). Part of the lookup key alongside account_number.
    sender_domain: Mapped[str] = mapped_column(String(255), nullable=False)
    # The provider account number, normalized (upper, spaces/dashes/dots
    # stripped). PLAINTEXT — equality lookup needs a deterministic value, which
    # rules out EncryptedString (its ciphertext is non-deterministic).
    account_number: Mapped[str] = mapped_column(String(100), nullable=False)

    # Human-readable provider name ("AT&T", "CenterPoint", "City of Houston
    # Water") filled from a known-domain map; null for an unrecognized domain.
    provider_label: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # How the link was learned: "auto_learn" (derived during extraction) or
    # "manual_link" (host picked the property). manual_link is authoritative.
    source: Mapped[str] = mapped_column(String(20), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        # One row per (org, provider domain, account). Re-learning the SAME
        # account for the SAME property touches the existing row; re-learning it
        # for a DIFFERENT property updates property_id (the account moved).
        UniqueConstraint(
            "organization_id",
            "sender_domain",
            "account_number",
            name="uq_utility_account_link",
        ),
        CheckConstraint(
            "source IN ('auto_learn', 'manual_link')",
            name="chk_utility_account_link_source",
        ),
        # Postgres does not auto-index FKs; index property_id and user_id for the
        # CASCADE delete and reverse (list-by-property) lookups.
        Index("ix_utility_link_property_id", "property_id"),
        Index("ix_utility_link_user_id", "user_id"),
    )

    property = relationship("Property", lazy="noload")
