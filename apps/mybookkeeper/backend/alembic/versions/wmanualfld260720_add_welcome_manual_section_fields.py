"""add welcome_manual_section_fields

Revision ID: wmanualfld260720
Revises: utillink260624
Create Date: 2026-07-20

Guest welcome manual — section fields (label + value pairs, e.g. the Wi-Fi
network name and password). One field per row, attached to a section, ordered
by ``display_order``, cascade-deleted with the section.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "wmanualfld260720"
down_revision: Union[str, None] = "utillink260624"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "welcome_manual_section_fields",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("section_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("value", sa.String(length=500), nullable=True),
        sa.Column("display_order", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["section_id"], ["welcome_manual_sections.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_welcome_manual_section_fields_section_id",
        "welcome_manual_section_fields",
        ["section_id"],
    )
    op.create_index(
        "ix_welcome_manual_section_fields_section_order",
        "welcome_manual_section_fields",
        ["section_id", "display_order"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_welcome_manual_section_fields_section_order",
        table_name="welcome_manual_section_fields",
    )
    op.drop_index(
        "ix_welcome_manual_section_fields_section_id",
        table_name="welcome_manual_section_fields",
    )
    op.drop_table("welcome_manual_section_fields")
