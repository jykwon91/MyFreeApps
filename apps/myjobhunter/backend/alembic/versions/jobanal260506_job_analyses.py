"""Add the job_analyses table — backs the new /analyze page.

A row stores one Claude-driven fit-ranking pass over a job description:
JD source (url + text), the per-dimension verdicts the model produced,
the operator's eventual decision (apply / archive). Soft-deletes via
deleted_at so a low-fit analysis can be archived without losing the
audit trail.

Revision ID: jobanal260506
Revises: propcache260506
Create Date: 2026-05-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

revision: str = "jobanal260506"
down_revision: Union[str, None] = "propcache260506"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "job_analyses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_url", sa.Text, nullable=True),
        sa.Column("jd_text", sa.Text, nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column(
            "extracted",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("verdict", sa.String(30), nullable=False),
        sa.Column("verdict_summary", sa.Text, nullable=False),
        sa.Column(
            "dimensions",
            JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "red_flags",
            ARRAY(sa.Text),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "green_flags",
            ARRAY(sa.Text),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "total_tokens_in",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_tokens_out",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_cost_usd",
            sa.Numeric(10, 6),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "applied_application_id",
            UUID(as_uuid=True),
            sa.ForeignKey("applications.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
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
            "verdict IN ('strong_fit','worth_considering','stretch','mismatch')",
            name="chk_job_analysis_verdict",
        ),
        sa.CheckConstraint(
            "source_url IS NOT NULL OR length(jd_text) > 0",
            name="chk_job_analysis_has_source",
        ),
    )
    op.create_index(
        "ix_job_analyses_user_id",
        "job_analyses",
        ["user_id"],
    )
    op.create_index(
        "ix_job_analysis_user_created",
        "job_analyses",
        ["user_id", "created_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_job_analysis_user_fingerprint",
        "job_analyses",
        ["user_id", "fingerprint"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_job_analysis_user_fingerprint", table_name="job_analyses",
    )
    op.drop_index(
        "ix_job_analysis_user_created", table_name="job_analyses",
    )
    op.drop_index("ix_job_analyses_user_id", table_name="job_analyses")
    op.drop_table("job_analyses")
