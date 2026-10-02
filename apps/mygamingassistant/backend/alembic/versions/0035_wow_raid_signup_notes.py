"""wow_raid sign-up notes (Raid: Edit → Notes, My sign-up → Add note)

Revision ID: 0035
Revises: 0034
Create Date: 2026-10-02 18:00:00.000000

WHY.  Raid-Helper lets a player tell the raid leader why they're late,
tentative or absent.  A leader turns notes on per raid, and each sign-up
keeps its own note:

* ``wow_raid_event.signup_notes_enabled`` — whether members can leave the
  leader a note.  Off by default; turning it off hides the notes already
  written (they stay, and come back when it's turned on again).
* ``wow_raid_signup.note`` — the member's note, 1–100 characters
  (``raid_note.clean_note``); null = none.  Cleared when the member's
  status changes.  Only the leader and organisers read it.

Not to be confused with ``wow_raid_event.notes``, the leader's description.
No backfill: every raid starts with notes off.
"""
import sqlalchemy as sa
from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wow_raid_event",
        sa.Column("signup_notes_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("wow_raid_signup", sa.Column("note", sa.String(length=100), nullable=True))
    op.create_check_constraint(
        "ck_wowraidsignup_note_len",
        "wow_raid_signup",
        "note IS NULL OR char_length(note) BETWEEN 1 AND 100",
    )


def downgrade() -> None:
    # Notes are dropped with the column; raids go back to having none.
    op.drop_constraint("ck_wowraidsignup_note_len", "wow_raid_signup", type_="check")
    op.drop_column("wow_raid_signup", "note")
    op.drop_column("wow_raid_event", "signup_notes_enabled")
