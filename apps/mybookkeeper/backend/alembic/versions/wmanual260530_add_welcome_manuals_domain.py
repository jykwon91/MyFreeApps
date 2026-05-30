"""add welcome manuals domain (welcome_manuals, welcome_manual_sections)

Revision ID: wmanual260530
Revises: extevt260520
Create Date: 2026-05-30

Guest welcome manual — PR 1 (backend CRUD). Standalone, org-scoped manuals
with ordered sections. Section images + send log arrive in later PRs.

Conventions:
- Dual scope: organization_id + user_id (CASCADE)
- property_id is an OPTIONAL tag — SET NULL on property delete
- Soft-delete via deleted_at (partial index excludes deleted rows)
- UUID primary keys; DateTime(timezone=True) with server_default = func.now()
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "wmanual260530"
down_revision: Union[str, None] = "extevt260520"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "welcome_manuals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("intro_text", sa.Text(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_welcome_manuals_organization_id", "welcome_manuals", ["organization_id"])
    op.create_index("ix_welcome_manuals_user_id", "welcome_manuals", ["user_id"])
    op.create_index("ix_welcome_manuals_property_id", "welcome_manuals", ["property_id"])
    op.create_index(
        "ix_welcome_manuals_org_active",
        "welcome_manuals",
        ["organization_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_welcome_manuals_org_property",
        "welcome_manuals",
        ["organization_id", "property_id"],
    )

    op.create_table(
        "welcome_manual_sections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("manual_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("display_order", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["manual_id"], ["welcome_manuals.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_welcome_manual_sections_manual_id", "welcome_manual_sections", ["manual_id"])
    op.create_index(
        "ix_welcome_manual_sections_manual_order",
        "welcome_manual_sections",
        ["manual_id", "display_order"],
    )


def downgrade() -> None:
    op.drop_index("ix_welcome_manual_sections_manual_order", table_name="welcome_manual_sections")
    op.drop_index("ix_welcome_manual_sections_manual_id", table_name="welcome_manual_sections")
    op.drop_table("welcome_manual_sections")

    op.drop_index("ix_welcome_manuals_org_property", table_name="welcome_manuals")
    op.drop_index("ix_welcome_manuals_org_active", table_name="welcome_manuals")
    op.drop_index("ix_welcome_manuals_property_id", table_name="welcome_manuals")
    op.drop_index("ix_welcome_manuals_user_id", table_name="welcome_manuals")
    op.drop_index("ix_welcome_manuals_organization_id", table_name="welcome_manuals")
    op.drop_table("welcome_manuals")
