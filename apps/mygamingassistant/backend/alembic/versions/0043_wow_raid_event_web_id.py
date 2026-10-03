"""wow_raid_event.web_id (the raid's public web page)

Revision ID: 0043
Revises: 0042
Create Date: 2026-10-03 06:00:00.000000

WHY.  Raid-Helper gives every event a web view.  A raid's page lives at
``/wow-forever/raids/<web_id hex>``, and its post links to it ([Web view]).

``web_id`` is a random id of its own, not the event id.  The event id is in
every custom_id, log line and error report; ``web_id`` is a pure capability
(122 random bits): the page has no list or search, so only someone with the
link can open it.  It can also be rotated later without touching the
primary key.

One ``ADD COLUMN … NOT NULL DEFAULT gen_random_uuid()``.  Postgres evaluates
the volatile default per row, so every existing raid gets its own id
(``gen_random_uuid`` is core since PG13, no extension).  New raids, repeats
and copies get a fresh one from the same default.  A unique constraint backs
the page's lookup.  Downgrade drops the constraint and the column, and every
raid's web link stops working.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "wow_raid_event",
        sa.Column("web_id", UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
    )
    op.create_unique_constraint("uq_wowraidevent_web_id", "wow_raid_event", ["web_id"])


def downgrade() -> None:
    op.drop_constraint("uq_wowraidevent_web_id", "wow_raid_event", type_="unique")
    op.drop_column("wow_raid_event", "web_id")
