"""One savings research run for a person: when, how it went, what it cost.

Append-only history. ``error_type`` is Anthropic's ``error.type``
(``rate_limit_error``, ``overloaded_error``, ...), ``refusal``, or one of
ours (``app/core/savings_enums.py``); ``tool_error_codes`` lists every
server-tool failure the turn reported, as ``"<result block>:<code>"``. Neither
ever holds the provider's response body.

At most one run per person is ``running`` at a time
(``uq_savings_runs_one_running``): a "Research now" click and the daily job
can't both research for the same person at once.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.savings_enums import RUN_STATUS_RUNNING, RUN_STATUSES_SQL, RUN_TRIGGERS_SQL
from app.db.base import Base

_ONE_RUNNING = text(f"status = '{RUN_STATUS_RUNNING}'")


class SavingsResearchRun(Base):
    __tablename__ = "savings_research_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False,
    )
    trigger: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    started_at: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[_dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tool_error_codes: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]",
    )
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    web_search_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    web_fetch_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    ideas_found: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
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

    __table_args__ = (
        CheckConstraint(f"status IN {RUN_STATUSES_SQL}", name="chk_savings_run_status"),
        CheckConstraint(f"trigger IN {RUN_TRIGGERS_SQL}", name="chk_savings_run_trigger"),
        CheckConstraint(
            f"(status = '{RUN_STATUS_RUNNING}') = (finished_at IS NULL)",
            name="chk_savings_run_finished_when_done",
        ),
        # "This person's latest runs" and "manual runs in the last day".
        Index("ix_savings_runs_org_user_started", "organization_id", "user_id", "started_at"),
        Index(
            "uq_savings_runs_one_running",
            "organization_id", "user_id",
            unique=True,
            postgresql_where=_ONE_RUNNING,
            sqlite_where=_ONE_RUNNING,
        ),
    )
