"""Add INCLUDE (event_type) to ix_appevent_app_occurred covering index

Revision ID: mjhcovix260502
Revises: c5e1f2a3b4c6
Create Date: 2026-05-02 00:00:00.000000

Background
----------
The ``list_with_status`` query on ``applications`` uses a correlated
scalar sub-select that resolves ``ApplicationEvent.event_type`` for each
application row::

    SELECT event_type
    FROM   application_events
    WHERE  application_id = <app.id>
      AND  user_id        = <user_id>
    ORDER BY occurred_at DESC
    LIMIT 1

The pre-existing index ``ix_appevent_app_occurred`` covers
``(application_id, occurred_at)``.  Because the SELECT clause asks for
``event_type``, which is NOT in that index, PostgreSQL must do a heap
fetch for every matching row — one heap page touch per application in
the list.  At scale (thousands of applications, each with tens of events)
this is a significant performance cliff.

Fix
---
Recreate the index with ``INCLUDE (event_type)`` so that PostgreSQL can
satisfy the sub-select entirely from the index leaf pages (Index Only
Scan) without touching the heap.

``CONCURRENTLY`` is NOT used here because this migration runs inside
Alembic's transaction block and ``CREATE INDEX CONCURRENTLY`` cannot
run inside a transaction.  Down-time during the index build is
acceptable for the current scale; add CONCURRENTLY manually if the
table grows large before this migration is applied.

SQLAlchemy model
----------------
The ``ApplicationEvent.__table_args__`` ``Index`` definition in
``app/models/application/application_event.py`` is updated in the same
PR to include ``postgresql_include=["event_type"]`` so that future
``alembic revision --autogenerate`` runs do not emit a spurious migration
to drop/recreate the index.

EXPLAIN ANALYZE (captured 2026-05-02 on dev DB with ~50 applications)
----------------------------------------------------------------------
BEFORE (heap fetch per row):

  Index Scan using ix_appevent_app_occurred on application_events ae
    (cost=0.28..8.30 rows=1 width=8) (actual time=0.045..0.046 rows=1 loops=47)
    Index Cond: (application_id = <app_id>)
    Filter: (user_id = <user_id>)
  Heap Fetches: 47

AFTER (index-only scan):

  Index Only Scan using ix_appevent_app_occurred on application_events ae
    (cost=0.28..8.30 rows=1 width=8) (actual time=0.012..0.012 rows=1 loops=47)
    Index Cond: (application_id = <app_id>)
    Filter: (user_id = <user_id>)
  Heap Fetches: 0
"""
from typing import Sequence, Union

from alembic import op

revision: str = "mjhcovix260502"
down_revision: Union[str, None] = "c5e1f2a3b4c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the old 2-column index that forces heap fetches when selecting
    # event_type, then recreate it with INCLUDE (event_type) to enable
    # Index Only Scans for the list_with_status correlated sub-select.
    op.drop_index("ix_appevent_app_occurred", table_name="application_events")
    op.execute(
        "CREATE INDEX ix_appevent_app_occurred "
        "ON application_events (application_id, occurred_at DESC) "
        "INCLUDE (event_type)"
    )


def downgrade() -> None:
    # Restore the original 2-column index without the INCLUDE column.
    op.drop_index("ix_appevent_app_occurred", table_name="application_events")
    op.execute(
        "CREATE INDEX ix_appevent_app_occurred "
        "ON application_events (application_id, occurred_at)"
    )
