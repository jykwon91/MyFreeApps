"""Number each try of a rent reminder send.

A failed reminder is retried by resetting its row (the unique key allows one
row per plan, due date and channel), so the phone's late news about an earlier
try used to land on the retry: a failure from try 1 could mark try 2 failed,
and a confirmation from try 1 could mark try 2 sent while it was still queued.
``attempt`` goes up by one on every retry and is sent to httpSMS inside the
``request_id`` (``<send id>:<attempt>``), so webhooks about an older try are
recognised and ignored.

Existing rows are try 1, which is also how a ``request_id`` without a try
number (sent before this change) is read.

Revision ID: rentremattempt261121
Revises: rtplorgname261121
Create Date: 2026-11-21 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "rentremattempt261121"
down_revision: str | None = "rtplorgname261121"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "rent_reminder_sends",
        sa.Column("attempt", sa.SmallInteger(), nullable=False, server_default="1"),
    )
    op.create_check_constraint(
        "chk_rent_reminder_send_attempt_positive", "rent_reminder_sends", "attempt >= 1",
    )


def downgrade() -> None:
    op.drop_constraint(
        "chk_rent_reminder_send_attempt_positive", "rent_reminder_sends", type_="check",
    )
    op.drop_column("rent_reminder_sends", "attempt")
