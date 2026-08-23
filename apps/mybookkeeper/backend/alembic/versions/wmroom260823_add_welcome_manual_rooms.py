"""add welcome manual rooms + per-room section scoping

Lets one manual serve several lettable rooms of the same property. Sections
stay shared by default (``room_id IS NULL``); a section tagged with a room
appears only in that room's emailed guide.

Purely additive — every existing section keeps ``room_id = NULL``, so a manual
with no rooms behaves exactly as it did before.

Revision ID: wmroom260823
Revises: mtg260817
Create Date: 2026-08-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "wmroom260823"
down_revision: Union[str, None] = "mtg260817"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "welcome_manual_rooms",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "manual_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("welcome_manuals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("display_order", sa.SmallInteger(), nullable=False, server_default="0"),
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
    )
    op.create_index(
        "ix_welcome_manual_rooms_manual_id", "welcome_manual_rooms", ["manual_id"],
    )
    op.create_index(
        "ix_welcome_manual_rooms_manual_order",
        "welcome_manual_rooms",
        ["manual_id", "display_order"],
    )

    op.add_column(
        "welcome_manual_sections",
        sa.Column("room_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_welcome_manual_sections_room_id",
        "welcome_manual_sections",
        "welcome_manual_rooms",
        ["room_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_welcome_manual_sections_room_id", "welcome_manual_sections", ["room_id"],
    )
    op.create_index(
        "ix_welcome_manual_sections_manual_room",
        "welcome_manual_sections",
        ["manual_id", "room_id", "display_order"],
    )


def downgrade() -> None:
    # Room-scoped sections are meaningless without their room, and the FK is
    # ON DELETE CASCADE — drop them explicitly so the downgrade doesn't leave
    # room-specific content stranded and visible in every guide.
    op.execute("DELETE FROM welcome_manual_sections WHERE room_id IS NOT NULL")

    op.drop_index("ix_welcome_manual_sections_manual_room", table_name="welcome_manual_sections")
    op.drop_index("ix_welcome_manual_sections_room_id", table_name="welcome_manual_sections")
    op.drop_constraint(
        "fk_welcome_manual_sections_room_id", "welcome_manual_sections", type_="foreignkey",
    )
    op.drop_column("welcome_manual_sections", "room_id")

    op.drop_index("ix_welcome_manual_rooms_manual_order", table_name="welcome_manual_rooms")
    op.drop_index("ix_welcome_manual_rooms_manual_id", table_name="welcome_manual_rooms")
    op.drop_table("welcome_manual_rooms")
