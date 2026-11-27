"""Create the savings research tables.

* ``savings_research_settings`` — one row per (workspace, person): whether
  daily research is on, and when it was last turned on.
* ``savings_research_runs`` — one row per research run: trigger, status,
  timing, Anthropic error type and server-tool error codes, token and
  search counts. At most one ``running`` row per person (partial unique index).
* ``savings_ideas`` — the researched ideas, one per (workspace, person,
  idea_key), with the person's open / done / dismissed choice.

Every table is scoped to organization + user (CASCADE from both, each
indexed), like financial accounts and mortgages. Purely additive: nothing
existing changes, and every table starts empty. Downgrade drops all three
tables and the ideas and run history in them.

Revision ID: savings261127
Revises: payeekey261127
Create Date: 2026-11-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.savings_enums import (
    IDEA_CATEGORIES_SQL,
    IDEA_EFFORTS_SQL,
    IDEA_STATUSES_SQL,
    RUN_STATUSES_SQL,
    RUN_TRIGGERS_SQL,
)

revision = "savings261127"
down_revision = "payeekey261127"
branch_labels = None
depends_on = None


def _tenant_columns() -> list[sa.Column]:
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
    ]


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def _tenant_indexes(table: str) -> None:
    op.create_index(f"ix_{table}_organization_id", table, ["organization_id"])
    op.create_index(f"ix_{table}_user_id", table, ["user_id"])


def upgrade() -> None:
    op.create_table(
        "savings_research_settings",
        *_tenant_columns(),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("enabled_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_savings_research_settings_org_user"),
    )
    _tenant_indexes("savings_research_settings")

    op.create_table(
        "savings_research_runs",
        *_tenant_columns(),
        sa.Column("trigger", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_type", sa.String(50), nullable=True),
        sa.Column(
            "tool_error_codes", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("web_search_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("web_fetch_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ideas_found", sa.Integer(), nullable=False, server_default="0"),
        *_timestamps(),
        sa.CheckConstraint(f"status IN {RUN_STATUSES_SQL}", name="chk_savings_run_status"),
        sa.CheckConstraint(f"trigger IN {RUN_TRIGGERS_SQL}", name="chk_savings_run_trigger"),
        sa.CheckConstraint(
            "(status = 'running') = (finished_at IS NULL)", name="chk_savings_run_finished_when_done",
        ),
    )
    _tenant_indexes("savings_research_runs")
    op.create_index(
        "ix_savings_runs_org_user_started",
        "savings_research_runs",
        ["organization_id", "user_id", "started_at"],
    )
    op.create_index(
        "uq_savings_runs_one_running",
        "savings_research_runs",
        ["organization_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'running'"),
    )

    op.create_table(
        "savings_ideas",
        *_tenant_columns(),
        sa.Column(
            "last_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("savings_research_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("idea_key", sa.String(160), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("subject", sa.String(120), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("savings_low_cents", sa.BigInteger(), nullable=False),
        sa.Column("savings_high_cents", sa.BigInteger(), nullable=False),
        sa.Column("effort", sa.String(10), nullable=False),
        sa.Column("why_it_fits", sa.Text(), nullable=False),
        sa.Column("steps", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("source_urls", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("card_details", postgresql.JSONB(), nullable=True),
        sa.Column("expires_on", sa.Date(), nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="open"),
        sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_found_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_confirmed_at", sa.DateTime(timezone=True), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("organization_id", "user_id", "idea_key", name="uq_savings_ideas_org_user_key"),
        sa.CheckConstraint(f"category IN {IDEA_CATEGORIES_SQL}", name="chk_savings_idea_category"),
        sa.CheckConstraint(f"effort IN {IDEA_EFFORTS_SQL}", name="chk_savings_idea_effort"),
        sa.CheckConstraint(f"status IN {IDEA_STATUSES_SQL}", name="chk_savings_idea_status"),
        sa.CheckConstraint(
            "savings_low_cents >= 0 AND savings_high_cents >= savings_low_cents",
            name="chk_savings_idea_savings_range",
        ),
    )
    _tenant_indexes("savings_ideas")
    op.create_index("ix_savings_ideas_last_run_id", "savings_ideas", ["last_run_id"])
    op.create_index(
        "ix_savings_ideas_org_user_status", "savings_ideas", ["organization_id", "user_id", "status"],
    )


def downgrade() -> None:
    op.drop_table("savings_ideas")
    op.drop_table("savings_research_runs")
    op.drop_table("savings_research_settings")
