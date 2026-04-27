"""add reply_templates table for templated inquiry replies

Revision ID: e7g9h2j4k6l8
Revises: d6f8b1a2c4e5
Create Date: 2026-04-26

Phase 2 / PR 2.3 of the rentals expansion. See RENTALS_PLAN.md §9.2 (template
selection UX) and §9.3 (large_dog_disclosure auto-prepend at render time —
NOT stored in template body).

Conventions per RENTALS_PLAN.md §4.1:
- Dual scope: organization_id + user_id.
- Soft-delete via ``is_archived`` boolean (templates are configuration; no
  ``deleted_at`` because we don't want a date column to be the source of truth
  for "is this currently usable").
- Per-user UNIQUE on ``name`` so the idempotent default-template seed can
  be re-run safely.
- Partial index on ``(organization_id, display_order) WHERE is_archived = false``
  is the working set for the template picker.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e7g9h2j4k6l8"
down_revision: Union[str, None] = "d6f8b1a2c4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reply_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("subject_template", sa.String(length=500), nullable=False),
        sa.Column("body_template", sa.Text(), nullable=False),
        sa.Column(
            "is_archived",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "display_order",
            sa.SmallInteger(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", "name", name="uq_reply_template_user_name"),
    )
    op.create_index(
        "ix_reply_templates_organization_id",
        "reply_templates",
        ["organization_id"],
    )
    op.create_index(
        "ix_reply_templates_user_id",
        "reply_templates",
        ["user_id"],
    )
    op.create_index(
        "ix_reply_templates_org_order_active",
        "reply_templates",
        ["organization_id", "display_order"],
        postgresql_where=sa.text("is_archived = false"),
    )


def downgrade() -> None:
    op.drop_index("ix_reply_templates_org_order_active", table_name="reply_templates")
    op.drop_index("ix_reply_templates_user_id", table_name="reply_templates")
    op.drop_index("ix_reply_templates_organization_id", table_name="reply_templates")
    op.drop_table("reply_templates")
