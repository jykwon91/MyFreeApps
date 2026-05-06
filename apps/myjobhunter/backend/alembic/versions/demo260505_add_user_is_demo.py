"""Add ``users.is_demo`` boolean flag for showcase / sandbox accounts.

Demo accounts are real ``users`` rows seeded with realistic dummy data so
operators can showcase the app to strangers without manually creating
applications/companies/profile content. The ``is_demo`` flag lets the
admin demo-management API filter and bulk-delete demo accounts safely
(real accounts must NEVER be deletable from that endpoint).

Mirrors MBK's ``organizations.is_demo`` shape — but MJH has no orgs, so
the flag lives on the user row directly. Default ``false`` for every
existing row; new demo accounts opt in by setting ``True`` at creation
time. Column is non-nullable so we never accidentally treat a NULL as
"maybe a demo" — explicit booleans only.

Revision ID: demo260505
Revises: refine260505
Create Date: 2026-05-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "demo260505"
down_revision: Union[str, None] = "refine260505"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_demo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # Partial index — most rows will be is_demo=false, so the index only
    # needs to cover the small set of demo rows. Keeps the admin
    # ``list_demo_users`` query fast without bloating writes for the 99%
    # case.
    op.create_index(
        "ix_users_is_demo",
        "users",
        ["is_demo"],
        postgresql_where=sa.text("is_demo = true"),
    )


def downgrade() -> None:
    op.drop_index("ix_users_is_demo", table_name="users")
    op.drop_column("users", "is_demo")
