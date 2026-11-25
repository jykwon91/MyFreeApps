"""ORM model for ``personal_transfer_senders``: people whose payments are personal, not rent.

When the person marks a payment a personal transfer (a Zelle from a sibling,
a friend paying them back), the sender is remembered here so their later
payments are marked the same way and never reach Payment Review.

Kept apart from ``payer_alias`` on purpose: an alias links a payer to a tenant
(``applicant_id`` NOT NULL, part of its unique key), and this is the opposite
rule. Folding it in would need a nullable tenant in that key (NULLs are
distinct in a PostgreSQL unique index, so duplicates slip in) and a filter in
every alias consumer.

``payer_handle`` is the empty string, never NULL, when the payment showed no
handle, so it takes part in the unique key the same way on SQLite (tests) and
PostgreSQL. An empty handle matches the name with any handle; see
``services/transactions/personal_sender_matcher``.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PersonalTransferSender(Base):
    __tablename__ = "personal_transfer_senders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False,
    )
    # The rule belongs to the workspace, so it outlives the member who made it.
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    # The sender as the payment named them, for the list on Payment Review.
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Lower-cased, whitespace collapsed: what an incoming payer name is compared with.
    normalized_payer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    payer_handle: Mapped[str] = mapped_column(String(255), nullable=False, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        # The leftmost (organization_id, normalized_payer_name) prefix serves the
        # per-payment lookup, so no separate org index is needed.
        UniqueConstraint(
            "organization_id", "normalized_payer_name", "payer_handle",
            name="uq_personal_transfer_senders_org_name_handle",
        ),
        # A nameless rule would match nobody, or (with an empty handle) be a
        # wildcard. Never store one.
        CheckConstraint("normalized_payer_name <> ''", name="chk_personal_transfer_senders_name"),
        Index("ix_personal_transfer_senders_created_by", "created_by_user_id"),
    )
