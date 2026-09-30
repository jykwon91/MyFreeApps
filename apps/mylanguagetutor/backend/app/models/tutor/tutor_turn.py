"""tutor_turn -- one learner utterance + the tutor's reply within a session.

Transcript text (learner, reply, corrections, translation) is learner PII and is
stored encrypted via the app's ``EncryptedString`` (Fernet, HKDF-derived PII
key); ``key_version`` records which key generation wrote the row so a future
rotation can re-encrypt selectively. Never log these columns.

``reply_text`` / ``corrections_json`` are nullable so a turn whose reply stream
was cut off (``partial``) or never produced (``failed``) is still recorded.
``user_id`` is denormalised from the session so every read can filter by tenant
without a join, and so the cascade from ``users`` reaches turns directly.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encrypted_string_type import EncryptedString
from app.core.tutor_enums import TURN_STATUS_CODES_SQL
from app.db.base import Base

# Plaintext size budgets (documentary; the DB column holds the larger ciphertext).
LEARNER_TEXT_MAX = 4000
REPLY_TEXT_MAX = 8000
CORRECTIONS_JSON_MAX = 16000
TRANSLATION_TEXT_MAX = 8000


class TutorTurn(Base):
    __tablename__ = "tutor_turn"
    __table_args__ = (
        UniqueConstraint("session_id", "seq", name="uq_tutor_turn_session_seq"),
        CheckConstraint(f"status IN {TURN_STATUS_CODES_SQL}", name="ck_tutor_turn_status"),
        Index("ix_tutor_turn_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tutor_session.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    learner_text: Mapped[str] = mapped_column(
        EncryptedString(LEARNER_TEXT_MAX), nullable=False,
    )
    reply_text: Mapped[str | None] = mapped_column(
        EncryptedString(REPLY_TEXT_MAX), nullable=True,
    )
    corrections_json: Mapped[str | None] = mapped_column(
        EncryptedString(CORRECTIONS_JSON_MAX), nullable=True,
    )
    translation_text: Mapped[str | None] = mapped_column(
        EncryptedString(TRANSLATION_TEXT_MAX), nullable=True,
    )
    key_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1",
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    input_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
    output_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
    cache_read_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
