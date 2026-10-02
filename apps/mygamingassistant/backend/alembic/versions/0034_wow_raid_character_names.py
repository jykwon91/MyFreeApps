"""wow_raid character names (My sign-up → Character name, /raid prefs character:)

Revision ID: 0034
Revises: 0033
Create Date: 2026-10-02 12:00:00.000000

WHY.  Raid-Helper shows a player's in-game character name on the raid post
instead of their Discord name.  A player keeps one name per class, and each
sign-up keeps its own copy:

* ``wow_raid_member_pref.character_names`` — ``{"shaman": "Thrallbot", …}``;
  keys are the nine classes.  Read through
  ``raid_character.saved_name``, which drops anything else.  Never null:
  ``'{}'`` until the player saves a name.
* ``wow_raid_signup.character_name`` — the name this sign-up shows, copied
  from the saved names when the player signs up or switches class.  Null
  means "show the Discord name".  2–12 letters (``raid_character.clean_name``).

No backfill: everyone keeps showing their Discord name until they set one.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wow_raid_member_pref",
        sa.Column("character_names", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.add_column("wow_raid_signup", sa.Column("character_name", sa.String(length=12), nullable=True))
    op.create_check_constraint(
        "ck_wowraidmemberpref_character_names",
        "wow_raid_member_pref",
        "jsonb_typeof(character_names) = 'object'",
    )
    op.create_check_constraint(
        "ck_wowraidsignup_character_name_len",
        "wow_raid_signup",
        "character_name IS NULL OR char_length(character_name) BETWEEN 2 AND 12",
    )


def downgrade() -> None:
    # Everyone goes back to showing their Discord name.
    op.drop_constraint("ck_wowraidsignup_character_name_len", "wow_raid_signup", type_="check")
    op.drop_constraint("ck_wowraidmemberpref_character_names", "wow_raid_member_pref", type_="check")
    op.drop_column("wow_raid_signup", "character_name")
    op.drop_column("wow_raid_member_pref", "character_names")
