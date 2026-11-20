"""Fill in ``applications.applied_at`` left empty by hand-added applications.

The add form never sent ``applied_at``, so applications added by hand were
stored without one, while the ``applied`` event logged alongside them was dated
the moment they were added. The board, timeline and days-in-stage already read
that event as when the person applied; only the Applied column and the
"applied" sort read the empty column, so those rows showed "—" and sorted last.
New applications now always store ``applied_at`` (the service defaults it to
now), and this fills the old rows from their own event log: the earliest
``applied`` event, so an earlier "Applied" the person logged by hand to
backdate it wins over the one stamped when the row was added.

Only empty values are written, from the same user's events; a row with no
``applied`` event at all is left empty. Data-only. Downgrade is a no-op: a
filled value can't be told apart from one the person entered.

Revision ID: appliedat261119
Revises: promolink261113
Create Date: 2026-11-19
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine import Connection

revision: str = "appliedat261119"
down_revision: Union[str, None] = "promolink261113"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_BACKFILL_APPLIED_AT = sa.text(
    "UPDATE applications AS a SET applied_at = first_applied.occurred_at "
    "FROM ("
    "  SELECT application_id, user_id, MIN(occurred_at) AS occurred_at "
    "  FROM application_events WHERE event_type = 'applied' "
    "  GROUP BY application_id, user_id"
    ") AS first_applied "
    "WHERE a.applied_at IS NULL "
    "AND first_applied.application_id = a.id AND first_applied.user_id = a.user_id"
)


def upgrade() -> None:
    backfill_applied_at(op.get_bind())


def downgrade() -> None:
    pass


def backfill_applied_at(bind: Connection) -> None:
    """Date every application without ``applied_at`` by its earliest ``applied`` event."""
    bind.execute(_BACKFILL_APPLIED_AT)
