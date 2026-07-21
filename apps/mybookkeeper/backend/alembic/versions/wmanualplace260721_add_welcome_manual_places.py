"""add welcome_manual_places

Revision ID: wmanualplace260721
Revises: wmanualfld260720
Create Date: 2026-07-21

Guest welcome manual — restaurant "places" (a flat guest dining directory).
One place per row, attached directly to the manual (no section parent),
ordered by ``display_order``, cascade-deleted with the manual.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "wmanualplace260721"
down_revision: Union[str, None] = "wmanualfld260720"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "welcome_manual_places",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("manual_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("cuisine", sa.String(length=50), nullable=False),
        sa.Column("price_tier", sa.String(length=4), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("map_url", sa.String(length=2048), nullable=True),
        sa.Column("display_order", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["manual_id"], ["welcome_manuals.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "price_tier IN ('$', '$$', '$$$') OR price_tier IS NULL",
            name="ck_welcome_manual_places_price_tier",
        ),
    )
    op.create_index(
        "ix_welcome_manual_places_manual_order",
        "welcome_manual_places",
        ["manual_id", "display_order"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_welcome_manual_places_manual_order",
        table_name="welcome_manual_places",
    )
    op.drop_table("welcome_manual_places")
