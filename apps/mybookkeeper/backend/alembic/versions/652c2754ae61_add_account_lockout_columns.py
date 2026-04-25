"""add account lockout columns to users

Adds three columns to the users table to support account-level login lockout:
- failed_login_count: consecutive bad-password attempt counter
- locked_until: timestamp until which login is blocked (NULL = not locked)
- last_failed_login_at: timestamp of the most recent failure (used for auto-reset)

Also adds a partial index on locked_until for efficient locked-account queries.

Revision ID: 652c2754ae61
Revises: aa1bb2cc3dd4
Create Date: 2026-04-23 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "652c2754ae61"
down_revision: Union[str, None] = "aa1bb2cc3dd4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "failed_login_count",
            sa.SmallInteger(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "users",
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("last_failed_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Partial index — only indexes rows that are actually locked.
    op.execute(
        "CREATE INDEX ix_users_locked_until ON users (locked_until) "
        "WHERE locked_until IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_users_locked_until")
    op.drop_column("users", "last_failed_login_at")
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_login_count")
