"""wow_raid: signup spec + per-class saved specs

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-01 00:00:00.000000

WHY.  Raid-Helper-style signups pick a spec, not just a role.  The roster
shows spec icons, and the consumables DM knows a Balance Druid or an
Elemental Shaman is a caster.

* ``wow_raid_signup.spec`` — nullable, with a flat CHECK over every spec id.
  The class/spec pairing is validated in code (``raid_catalog.SPECS``).
  Rows from before this revision keep NULL.  They show their class icon,
  and the bot asks for the spec on the player's next button press.
  ``role`` is still written, derived from the spec.
* ``wow_raid_member_pref.saved_specs`` — JSONB class → spec, so each class
  remembers its own spec (one tap per class).

No backfill: a guessed spec would be wrong for some players, and asking
once is cheap.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None

# Frozen copy of app.models.wow.wow_raid_signup.WOW_SPECS at this revision.
_SPECS = (
    "affliction",
    "arcane",
    "arms",
    "assassination",
    "balance",
    "beast-mastery",
    "combat",
    "demonology",
    "destruction",
    "discipline",
    "elemental",
    "enhancement",
    "feral-damage",
    "feral-tank",
    "fire",
    "frost",
    "fury",
    "holy",
    "marksmanship",
    "protection",
    "restoration",
    "retribution",
    "shadow",
    "subtlety",
    "survival",
)


def upgrade() -> None:
    op.add_column("wow_raid_signup", sa.Column("spec", sa.String(20), nullable=True))
    op.create_check_constraint(
        "ck_wowraidsignup_spec", "wow_raid_signup", f"spec IS NULL OR spec IN {_SPECS!r}"
    )
    op.add_column(
        "wow_raid_member_pref",
        sa.Column(
            "saved_specs",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("wow_raid_member_pref", "saved_specs")
    op.drop_constraint("ck_wowraidsignup_spec", "wow_raid_signup", type_="check")
    op.drop_column("wow_raid_signup", "spec")
