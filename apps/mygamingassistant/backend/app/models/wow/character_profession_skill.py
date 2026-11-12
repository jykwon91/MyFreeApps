"""WowCharacterProfessionSkill — one profession's skill in one daily metric row.

Replaced as a set whenever Blizzard sends the professions; left as it was
when the professions call failed. A profession the character hasn't learned
has no row.
"""
import uuid

from sqlalchemy import ForeignKey, Integer, SmallInteger, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WowCharacterProfessionSkill(Base):
    __tablename__ = "wow_character_profession_skill"
    __table_args__ = (
        UniqueConstraint("daily_metric_id", "profession_id", name="uq_wowcharacterprofessionskill_metric_profession"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    daily_metric_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wow_character_daily_metric.id", ondelete="CASCADE"), nullable=False,
    )
    # Blizzard's profession id (the client's SkillLine id).
    profession_id: Mapped[int] = mapped_column(Integer, nullable=False)
    skill: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    max_skill: Mapped[int] = mapped_column(SmallInteger, nullable=False)
