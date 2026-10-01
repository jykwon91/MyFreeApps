"""wow_raid_event: draft status, creator display name, cancel reason

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-01 00:00:00.000000

WHY.  The raid-signup flow (``/raid-admin create``) shows the organiser a
private preview with [Post raid] / [Cancel] buttons before anything goes
public.  The preview's buttons need a durable handle on the pending raid, so
the event row is created up front in a new ``draft`` status and flipped to
``scheduled`` when the organiser confirms (idempotently — a double-click
can't post twice).  Drafts never appear in listings or autocomplete.

``created_by_display_name`` feeds the embed footer ("Created by <name>") —
embed footers can't render a ``<@id>`` mention, so the name is captured at
creation time.  ``cancel_reason`` lets the embed builder render the cancelled
state purely from the event row.
"""
import sqlalchemy as sa
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None

_OLD_STATUSES = ("scheduled", "cancelled", "completed")
_NEW_STATUSES = ("draft", "scheduled", "cancelled", "completed")


def upgrade() -> None:
    op.drop_constraint("ck_wowraidevent_status", "wow_raid_event", type_="check")
    op.create_check_constraint(
        "ck_wowraidevent_status", "wow_raid_event", f"status IN {_NEW_STATUSES!r}"
    )
    op.add_column(
        "wow_raid_event",
        sa.Column("created_by_display_name", sa.String(100), nullable=True),
    )
    op.add_column(
        "wow_raid_event",
        sa.Column("cancel_reason", sa.String(200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("wow_raid_event", "cancel_reason")
    op.drop_column("wow_raid_event", "created_by_display_name")
    # Drafts were never posted publicly — nothing references them outside
    # the organiser's (ephemeral) preview, so dropping them is lossless.
    op.execute("DELETE FROM wow_raid_event WHERE status = 'draft'")
    op.drop_constraint("ck_wowraidevent_status", "wow_raid_event", type_="check")
    op.create_check_constraint(
        "ck_wowraidevent_status", "wow_raid_event", f"status IN {_OLD_STATUSES!r}"
    )
