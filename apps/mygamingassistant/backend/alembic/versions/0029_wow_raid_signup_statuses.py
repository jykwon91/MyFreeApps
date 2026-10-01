"""wow_raid_signup: queued (overflow) vs bench (backup), absence

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-01 00:00:00.000000

WHY.  Raid-Helper's status semantics.  Until now ``bench`` meant "the raid
was full when you asked for a seat", and the bot moved bench players up by
itself.  Raid-Helper calls that the *queue* (``queue_bench``).  Its *Bench*
is something a member picks ("I'm a backup"), and nobody is moved off it
automatically.  "Declined" becomes Raid-Helper's *Absence*.

* status ``bench`` → ``queued`` (every existing bench row is overflow).
* status ``declined`` → ``absence``.
* ``bench`` stays valid and now means the backup a member chose.

Downgrade maps back: ``bench`` → ``tentative`` (the old code would promote a
bench row on its own), then ``queued`` → ``bench``, ``absence`` →
``declined``.
"""
from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None

# Frozen copies of app.models.wow.wow_raid_signup.SIGNUP_STATUSES.
_OLD_STATUSES = ("confirmed", "tentative", "bench", "late", "declined")
_NEW_STATUSES = ("confirmed", "late", "tentative", "bench", "queued", "absence")


def upgrade() -> None:
    op.drop_constraint("ck_wowraidsignup_status", "wow_raid_signup", type_="check")
    op.execute("UPDATE wow_raid_signup SET status = 'queued' WHERE status = 'bench'")
    op.execute("UPDATE wow_raid_signup SET status = 'absence' WHERE status = 'declined'")
    op.create_check_constraint(
        "ck_wowraidsignup_status", "wow_raid_signup", f"status IN {_NEW_STATUSES!r}"
    )


def downgrade() -> None:
    op.drop_constraint("ck_wowraidsignup_status", "wow_raid_signup", type_="check")
    op.execute("UPDATE wow_raid_signup SET status = 'tentative' WHERE status = 'bench'")
    op.execute("UPDATE wow_raid_signup SET status = 'bench' WHERE status = 'queued'")
    op.execute("UPDATE wow_raid_signup SET status = 'declined' WHERE status = 'absence'")
    op.create_check_constraint(
        "ck_wowraidsignup_status", "wow_raid_signup", f"status IN {_OLD_STATUSES!r}"
    )
