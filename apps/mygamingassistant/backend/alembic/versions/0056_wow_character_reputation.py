"""Add wow_faction and wow_character_reputation

Revision ID: 0056
Revises: 0055
Create Date: 2026-11-12 00:00:00.000000

WHY. The guild page's "one faction's standing" leaderboard ranks members by
their standing with a chosen faction, read from stored data. Each stored
daily metric row now keeps the character's standing per faction
(``wow_character_reputation``, replaced as a set like profession skills) and
faction names live once in ``wow_faction``. New tables start empty and fill
as characters are looked up or refreshed. Additive only.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0056"
down_revision: Union[str, None] = "0055"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "wow_faction",
        sa.Column("id", sa.Integer(), autoincrement=False, nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "wow_character_reputation",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("daily_metric_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("faction_id", sa.Integer(), nullable=False),
        sa.Column("tier", sa.SmallInteger(), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("max", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["daily_metric_id"], ["wow_character_daily_metric.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["faction_id"], ["wow_faction.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("daily_metric_id", "faction_id", name="uq_wowcharacterreputation_metric_faction"),
        sa.CheckConstraint("tier BETWEEN 0 AND 7", name="ck_wowcharacterreputation_tier"),
        sa.CheckConstraint("value >= 0 AND max >= 0", name="ck_wowcharacterreputation_progress"),
    )


def downgrade() -> None:
    op.drop_table("wow_character_reputation")
    op.drop_table("wow_faction")
