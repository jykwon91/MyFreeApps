import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encrypted_string_type import EncryptedString
from app.core.welcome_manual_constants import WELCOME_MANUAL_SEND_STATUSES_SQL
from app.db.base import Base


class WelcomeManualSend(Base):
    """A record of one attempt to email a welcome manual to a guest.

    Tenant isolation is via the parent manual: the service always loads the
    manual org-scoped before inserting a send row, so this table carries no
    ``organization_id``/``user_id`` of its own (mirrors the section/image
    tables). Cascade-deleted with its manual.

    ``recipient_email``/``recipient_name`` are free-typed guest PII, encrypted
    at rest via ``EncryptedString``. ``status`` records the outcome so the
    frontend can render a clear success / couldn't-send message; ``error_reason``
    is a short machine-readable diagnostic (e.g. ``smtp_not_configured``,
    ``send_failed``) for the operator.
    """

    __tablename__ = "welcome_manual_sends"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    manual_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("welcome_manuals.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Guest PII — encrypted at rest via EncryptedString TypeDecorator.
    recipient_email: Mapped[str] = mapped_column(EncryptedString(255), nullable=False)
    recipient_name: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)

    key_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1",
    )

    status: Mapped[str] = mapped_column(String(20), nullable=False)
    error_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            f"status IN {WELCOME_MANUAL_SEND_STATUSES_SQL}",
            name="chk_welcome_manual_send_status",
        ),
        # "Sends for this manual, newest first" lookup.
        Index(
            "ix_welcome_manual_sends_manual_created",
            "manual_id", "created_at",
        ),
    )
