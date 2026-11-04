"""One signed-in device. See ``RefreshSessionMixin``."""
import uuid

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from platform_shared.auth.refresh_session import RefreshSessionMixin
from app.db.base import Base


class RefreshSession(RefreshSessionMixin, Base):
    __tablename__ = "refresh_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
