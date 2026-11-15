"""Add blizzard_updated_at to wow_character

Revision ID: 0058
Revises: 0057
Create Date: 2026-11-15 00:00:00.000000

WHY. Blizzard's Profile API serves cached character data as of the
character's LAST LOG OUT.  The ``last_login_timestamp`` field (ms epoch)
in every profile response records exactly when that cached snapshot was
taken.  Storing it lets the guild roster tell viewers how old each
member's data is — "Blizzard data from 3h ago · updates when they log out"
— without a second API call.

The column is:
* nullable — older rows and characters whose profile Blizzard never
  returned a timestamp for start NULL, and populate on the next fetch.
* timezone-aware — stored as UTC, like every other timestamp here.
* named ``blizzard_updated_at`` rather than ``last_login`` to make the
  semantics clear at the query level: it is when Blizzard's snapshot of
  this character was last updated, not when the character literally logged
  in.

Additive only: existing rows start NULL.  The ``WowCharacter`` model and
``character_repo.FETCHED_FIELDS`` must be updated in the same commit.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0058"
down_revision: Union[str, None] = "0057"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "wow_character",
        sa.Column("blizzard_updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("wow_character", "blizzard_updated_at")
