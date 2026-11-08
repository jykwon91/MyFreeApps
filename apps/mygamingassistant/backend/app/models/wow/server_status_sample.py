"""WowServerStatusSample — one recorded status of one Forever ruleset in one region.

Written only by the scheduled recorder (``record_wow_server_status``): a row
when a ruleset's status changes, plus a checkpoint row every
``CHECKPOINT_INTERVAL`` while it doesn't. A row's status holds until the next
row for the same (region, ruleset), for at most ``MAX_SAMPLE_GAP``. Public
game data, so no user FK; rows older than ``HISTORY_RETENTION`` are purged.

``ruleset`` is Blizzard's slug (normal, pvp, roleplay, roleplay-pvp). It has
no CHECK: Blizzard can add a ruleset at any time and the recorder keeps it.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.wow_server_status import SERVER_STATUS_REGIONS, SERVER_STATUS_VALUES
from app.db.base import Base
from app.db.sql_in_list import sql_in_list


class WowServerStatusSample(Base):
    __tablename__ = "wow_server_status_sample"
    __table_args__ = (
        CheckConstraint(f"region IN {sql_in_list(SERVER_STATUS_REGIONS)}", name="ck_wowserverstatussample_region"),
        CheckConstraint(f"status IN {sql_in_list(SERVER_STATUS_VALUES)}", name="ck_wowserverstatussample_status"),
        # The history read and the recorder's "latest per ruleset".
        Index("ix_wowserverstatussample_region_ruleset_observed", "region", "ruleset", "observed_at"),
        # The retention purge.
        Index("ix_wowserverstatussample_observed_at", "observed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    region: Mapped[str] = mapped_column(String(4), nullable=False)
    ruleset: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(8), nullable=False)
    # When Blizzard reported this status (the recorder's check time).
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
