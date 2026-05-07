"""Add discovery tables: discovery_sources, discovery_fetches, discovered_jobs.

Backs the new /discover surface — proactive discovery of job postings from
public feeds (Greenhouse / Lever / Ashby / RemoteOK / HN) and aggregator
APIs (FlyByAPIs wrapping Google Jobs for LinkedIn / Indeed coverage).

Three tables ship together because they form a single coherent feature
(operator config → fetch audit → discovered postings) and partial indexes
on discovered_jobs reference all three states.

Also extends two existing CHECK constraints:

- ``application_events.source`` gains ``'discovery'`` so the kanban can
  show provenance when the operator promotes a discovered job to an
  application.

- ``extraction_logs.context_type`` gains ``'job_analysis'`` so per-feature
  cost rollups distinguish discovery scoring from the existing
  one-off /analyze flow. The previous code abused ``'other'`` for this.

Reversible: downgrade drops the three tables in reverse FK order, then
restores the original CHECK constraints.

Revision ID: disco260507
Revises: cresdesc260507
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision: str = "disco260507"
down_revision: Union[str, None] = "cresdesc260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_DISCOVERY_SOURCE_KINDS = (
    "greenhouse",
    "lever",
    "ashby",
    "remoteok",
    "hn_who_is_hiring",
    "workatastartup",
    "jsearch",
    "other",
)
_FETCH_STATUSES = ("running", "success", "partial", "error")
_REMOTE_TYPES = ("remote", "hybrid", "onsite", "unknown")
_SALARY_PERIODS = ("annual", "hourly", "monthly")

_OLD_APPEVENT_SOURCES = ("manual", "gmail", "calendar", "extension", "system")
_NEW_APPEVENT_SOURCES = _OLD_APPEVENT_SOURCES + ("discovery",)

_OLD_EXTRACTION_CONTEXTS = (
    "resume_parse",
    "jd_parse",
    "company_research",
    "cover_letter",
    "resume_tailor",
    "email_classify",
    "other",
)
_NEW_EXTRACTION_CONTEXTS = (
    "resume_parse",
    "jd_parse",
    "company_research",
    "cover_letter",
    "resume_tailor",
    "email_classify",
    "job_analysis",
    "other",
)


def _quote_list(values: tuple[str, ...]) -> str:
    return ",".join(f"'{v}'" for v in values)


def upgrade() -> None:
    # 1. discovery_sources — per-user saved-search rows. The fetch worker
    #    polls this table to find what's due to refresh.
    op.create_table(
        "discovery_sources",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column(
            "config",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "fetch_interval_minutes",
            sa.SmallInteger,
            nullable=False,
            server_default="1440",
        ),
        sa.Column("last_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_message", sa.Text, nullable=True),
        sa.Column(
            "last_seen_posted_at", sa.DateTime(timezone=True), nullable=True,
        ),
        sa.Column(
            "consecutive_failures",
            sa.SmallInteger,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            f"source IN ({_quote_list(_DISCOVERY_SOURCE_KINDS)})",
            name="chk_discovery_source",
        ),
        sa.CheckConstraint(
            "fetch_interval_minutes >= 15",
            name="chk_discovery_fetch_interval_pos",
        ),
        sa.CheckConstraint(
            "consecutive_failures >= 0",
            name="chk_discovery_consecutive_failures",
        ),
    )
    op.create_index(
        "ix_discovery_source_user", "discovery_sources", ["user_id"],
    )
    op.create_index(
        "uq_discovery_source_user_kind",
        "discovery_sources",
        ["user_id", "source"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )
    op.create_index(
        "ix_discovery_source_due",
        "discovery_sources",
        ["last_fetched_at"],
        postgresql_where=sa.text("is_active = true"),
    )

    # 2. discovery_fetches — append-only audit of every fetch cycle. One
    #    row per (source × tick). Crash detection: rows with status='running'
    #    older than 30 minutes are reaped to 'error'.
    op.create_table(
        "discovery_fetches",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "discovery_source_id",
            UUID(as_uuid=True),
            sa.ForeignKey("discovery_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="running",
        ),
        sa.Column("http_status", sa.SmallInteger, nullable=True),
        sa.Column(
            "fetched_count", sa.Integer, nullable=False, server_default="0",
        ),
        sa.Column(
            "new_count", sa.Integer, nullable=False, server_default="0",
        ),
        sa.Column(
            "updated_count", sa.Integer, nullable=False, server_default="0",
        ),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            f"status IN ({_quote_list(_FETCH_STATUSES)})",
            name="chk_discovery_fetch_status",
        ),
    )
    op.create_index(
        "ix_discovery_fetch_user_started",
        "discovery_fetches",
        ["user_id", "started_at"],
    )
    op.create_index(
        "ix_discovery_fetch_source_started",
        "discovery_fetches",
        ["discovery_source_id", "started_at"],
    )

    # 3. discovered_jobs — the inbox. Per-user rows; same posting from
    #    another user gets its own row (per-user scale at v1, refactor
    #    to shared cache when MJH crosses ~10 active users).
    op.create_table(
        "discovered_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("source_external_id", sa.String(255), nullable=False),
        sa.Column("source_publisher", sa.String(50), nullable=True),
        sa.Column("source_url", sa.Text, nullable=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("company_name", sa.String(300), nullable=False),
        sa.Column(
            "company_id",
            UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("location", sa.String(300), nullable=True),
        sa.Column(
            "remote_type",
            sa.String(20),
            nullable=False,
            server_default="unknown",
        ),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("description_normalized", sa.Text, nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=True),
        sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "discovered_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("salary_min", sa.Numeric(12, 2), nullable=True),
        sa.Column("salary_max", sa.Numeric(12, 2), nullable=True),
        sa.Column(
            "salary_currency",
            sa.String(3),
            nullable=True,
            server_default="USD",
        ),
        sa.Column("salary_period", sa.String(10), nullable=True),
        sa.Column("score", sa.SmallInteger, nullable=True),
        sa.Column("score_reason", sa.Text, nullable=True),
        sa.Column("scored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "scoring_extraction_log_id",
            UUID(as_uuid=True),
            sa.ForeignKey("extraction_logs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "promoted_application_id",
            UUID(as_uuid=True),
            sa.ForeignKey("applications.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("promoted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_payload", JSONB, nullable=True),
        sa.Column(
            "fetch_id",
            UUID(as_uuid=True),
            sa.ForeignKey("discovery_fetches.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            f"source IN ({_quote_list(_DISCOVERY_SOURCE_KINDS)})",
            name="chk_discovered_source",
        ),
        sa.CheckConstraint(
            f"remote_type IN ({_quote_list(_REMOTE_TYPES)})",
            name="chk_discovered_remote_type",
        ),
        sa.CheckConstraint(
            "score IS NULL OR (score >= 0 AND score <= 100)",
            name="chk_discovered_score",
        ),
        sa.CheckConstraint(
            f"salary_period IS NULL OR salary_period IN ({_quote_list(_SALARY_PERIODS)})",
            name="chk_discovered_salary_period",
        ),
        sa.CheckConstraint(
            "NOT (dismissed_at IS NOT NULL AND saved_at IS NOT NULL)",
            name="chk_discovered_state",
        ),
        sa.CheckConstraint(
            "(promoted_application_id IS NULL) = (promoted_at IS NULL)",
            name="chk_discovered_promoted",
        ),
    )
    op.create_index(
        "ix_discovered_user_id", "discovered_jobs", ["user_id"],
    )
    # Primary dedup: same posting refetched from same source. UPSERT on
    # this constraint advances seen_at without resetting state columns.
    op.create_index(
        "uq_discovered_user_source_extid",
        "discovered_jobs",
        ["user_id", "source", "source_external_id"],
        unique=True,
    )
    # Cross-source dedup on active rows. Same posting on Greenhouse + an
    # aggregator → keep the first; aggregator dup is silently dropped.
    op.create_index(
        "uq_discovered_user_content_hash",
        "discovered_jobs",
        ["user_id", "content_hash"],
        unique=True,
        postgresql_where=sa.text(
            "content_hash IS NOT NULL AND dismissed_at IS NULL",
        ),
    )
    # Inbox query: undismissed/unsaved/unpromoted, score DESC then newest.
    op.create_index(
        "ix_discovered_inbox",
        "discovered_jobs",
        ["user_id", "score", "discovered_at"],
        postgresql_where=sa.text(
            "dismissed_at IS NULL "
            "AND saved_at IS NULL "
            "AND promoted_application_id IS NULL"
        ),
    )
    op.create_index(
        "ix_discovered_saved",
        "discovered_jobs",
        ["user_id", "saved_at"],
        postgresql_where=sa.text(
            "saved_at IS NOT NULL AND dismissed_at IS NULL",
        ),
    )
    op.create_index(
        "ix_discovered_promoted_app",
        "discovered_jobs",
        ["promoted_application_id"],
        postgresql_where=sa.text("promoted_application_id IS NOT NULL"),
    )
    op.create_index(
        "ix_discovered_score_pending",
        "discovered_jobs",
        ["user_id", "discovered_at"],
        postgresql_where=sa.text("score IS NULL"),
    )
    op.create_index(
        "ix_discovered_company",
        "discovered_jobs",
        ["user_id", "company_id"],
        postgresql_where=sa.text("company_id IS NOT NULL"),
    )

    # 4. Extend application_events.source to permit 'discovery'.
    op.drop_constraint(
        "chk_appevent_source", "application_events", type_="check",
    )
    op.create_check_constraint(
        "chk_appevent_source",
        "application_events",
        f"source IN ({_quote_list(_NEW_APPEVENT_SOURCES)})",
    )

    # 5. Extend extraction_logs.context_type to permit 'job_analysis'.
    op.drop_constraint(
        "chk_extraction_log_context_type",
        "extraction_logs",
        type_="check",
    )
    op.create_check_constraint(
        "chk_extraction_log_context_type",
        "extraction_logs",
        f"context_type IN ({_quote_list(_NEW_EXTRACTION_CONTEXTS)})",
    )


def downgrade() -> None:
    # Restore original CHECK constraints first.
    op.drop_constraint(
        "chk_extraction_log_context_type",
        "extraction_logs",
        type_="check",
    )
    op.create_check_constraint(
        "chk_extraction_log_context_type",
        "extraction_logs",
        f"context_type IN ({_quote_list(_OLD_EXTRACTION_CONTEXTS)})",
    )

    op.drop_constraint(
        "chk_appevent_source", "application_events", type_="check",
    )
    op.create_check_constraint(
        "chk_appevent_source",
        "application_events",
        f"source IN ({_quote_list(_OLD_APPEVENT_SOURCES)})",
    )

    # Drop in reverse FK dependency order: discovered_jobs → discovery_fetches → discovery_sources.
    op.drop_index("ix_discovered_company", table_name="discovered_jobs")
    op.drop_index("ix_discovered_score_pending", table_name="discovered_jobs")
    op.drop_index("ix_discovered_promoted_app", table_name="discovered_jobs")
    op.drop_index("ix_discovered_saved", table_name="discovered_jobs")
    op.drop_index("ix_discovered_inbox", table_name="discovered_jobs")
    op.drop_index(
        "uq_discovered_user_content_hash", table_name="discovered_jobs",
    )
    op.drop_index(
        "uq_discovered_user_source_extid", table_name="discovered_jobs",
    )
    op.drop_index("ix_discovered_user_id", table_name="discovered_jobs")
    op.drop_table("discovered_jobs")

    op.drop_index(
        "ix_discovery_fetch_source_started", table_name="discovery_fetches",
    )
    op.drop_index(
        "ix_discovery_fetch_user_started", table_name="discovery_fetches",
    )
    op.drop_table("discovery_fetches")

    op.drop_index(
        "ix_discovery_source_due", table_name="discovery_sources",
    )
    op.drop_index(
        "uq_discovery_source_user_kind", table_name="discovery_sources",
    )
    op.drop_index(
        "ix_discovery_source_user", table_name="discovery_sources",
    )
    op.drop_table("discovery_sources")
