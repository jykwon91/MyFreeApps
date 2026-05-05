"""resume_refinement_sessions + resume_refinement_turns tables.

The resume-refinement feature is an iterative chat-style critique +
rewrite loop. Each session holds a live working markdown document and
a pointer into a list of improvement targets produced by an initial
critique pass. Each user/AI interaction is recorded as a turn for
auditability and for the "show me another option" affordance.

Revision ID: refine260505
Revises: role260505
Create Date: 2026-05-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "refine260505"
down_revision: Union[str, None] = "role260505"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "resume_refinement_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_resume_job_id",
            UUID(as_uuid=True),
            sa.ForeignKey("resume_upload_jobs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("current_draft", sa.Text, nullable=False, server_default=""),
        # Improvement-target metadata produced by the critique pass and
        # consumed turn-by-turn during the rewrite loop.
        sa.Column("improvement_targets", JSONB, nullable=True),
        sa.Column("target_index", sa.Integer, nullable=False, server_default="0"),
        # Pending proposal state — populated when the AI emits a proposal
        # and cleared when the user accepts/replaces/skips.
        sa.Column("pending_target_section", sa.Text, nullable=True),
        sa.Column("pending_proposal", sa.Text, nullable=True),
        sa.Column("pending_rationale", sa.Text, nullable=True),
        sa.Column("pending_clarifying_question", sa.Text, nullable=True),
        # Counters for cost / activity tracking.
        sa.Column("turn_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_tokens_in", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_tokens_out", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "total_cost_usd",
            sa.Numeric(10, 6),
            nullable=False,
            server_default="0",
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
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
            "status IN ('active','completed','abandoned')",
            name="chk_refinement_session_status",
        ),
    )
    op.create_index(
        "ix_refinement_session_user",
        "resume_refinement_sessions",
        ["user_id"],
    )
    op.create_index(
        "ix_refinement_session_user_status",
        "resume_refinement_sessions",
        ["user_id", "status"],
    )

    op.create_table(
        "resume_refinement_turns",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "session_id",
            UUID(as_uuid=True),
            sa.ForeignKey("resume_refinement_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("turn_index", sa.Integer, nullable=False),
        sa.Column("role", sa.String(40), nullable=False),
        sa.Column("target_section", sa.Text, nullable=True),
        sa.Column("proposed_text", sa.Text, nullable=True),
        sa.Column("user_text", sa.Text, nullable=True),
        sa.Column("rationale", sa.Text, nullable=True),
        sa.Column("clarifying_question", sa.Text, nullable=True),
        sa.Column("draft_after", sa.Text, nullable=True),
        sa.Column("tokens_in", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role IN ("
            "'ai_critique',"
            "'ai_proposal',"
            "'user_accept',"
            "'user_custom',"
            "'user_request_alternative',"
            "'user_skip',"
            "'session_complete'"
            ")",
            name="chk_refinement_turn_role",
        ),
    )
    op.create_index(
        "ix_refinement_turn_session",
        "resume_refinement_turns",
        ["session_id", "turn_index"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_refinement_turn_session", table_name="resume_refinement_turns",
    )
    op.drop_table("resume_refinement_turns")
    op.drop_index(
        "ix_refinement_session_user_status",
        table_name="resume_refinement_sessions",
    )
    op.drop_index(
        "ix_refinement_session_user",
        table_name="resume_refinement_sessions",
    )
    op.drop_table("resume_refinement_sessions")
