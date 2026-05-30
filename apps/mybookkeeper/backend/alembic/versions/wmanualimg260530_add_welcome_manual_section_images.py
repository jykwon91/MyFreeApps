"""add welcome_manual_section_images

Revision ID: wmanualimg260530
Revises: wmanual260530
Create Date: 2026-05-30

Guest welcome manual — PR 2 (section images). One image per row, attached to a
section, cascade-deleted with it. MinIO object cleanup is handled by the service.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "wmanualimg260530"
down_revision: Union[str, None] = "wmanual260530"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "welcome_manual_section_images",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("section_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("caption", sa.String(length=500), nullable=True),
        sa.Column("display_order", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["section_id"], ["welcome_manual_sections.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_welcome_manual_section_images_section_id",
        "welcome_manual_section_images",
        ["section_id"],
    )
    op.create_index(
        "ix_welcome_manual_section_images_section_order",
        "welcome_manual_section_images",
        ["section_id", "display_order"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_welcome_manual_section_images_section_order",
        table_name="welcome_manual_section_images",
    )
    op.drop_index(
        "ix_welcome_manual_section_images_section_id",
        table_name="welcome_manual_section_images",
    )
    op.drop_table("welcome_manual_section_images")
