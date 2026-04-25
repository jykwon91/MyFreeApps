import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class ActivityPeriod(Base):
    __tablename__ = "property_activity_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    property_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"))
    active_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    active_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    property = relationship("Property", back_populates="activity_periods")
