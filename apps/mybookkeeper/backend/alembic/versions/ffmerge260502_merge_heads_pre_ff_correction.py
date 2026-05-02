"""merge heads pre ff correction

Pre-existing two-head situation in main:
  - ``z0a1b2c3d4e5`` (drop_user_sessions_and_user_activities) — head of
    the OAuth-encryption chain
  - ``b2c3d4e5f6a1`` (public_inquiry_form_t0) — head of the inquiry-form
    chain landed via PR #130

Both have been live in main without ever being merged. ``alembic upgrade
head`` fails with "Multiple head revisions are present" until they are
joined. This empty merge revision joins them so subsequent migrations have
a single linear parent.

Empty body — alembic merge revisions don't run DDL; they just unify the
revision DAG. The FF capabilities correction lives in the next revision
(``ffcorr260502``).

Revision ID: ffmerge260502
Revises: z0a1b2c3d4e5, b2c3d4e5f6a1
Create Date: 2026-05-02 00:00:00.000000

"""
from typing import Sequence, Union


revision: str = "ffmerge260502"
down_revision: Union[str, Sequence[str], None] = ("z0a1b2c3d4e5", "b2c3d4e5f6a1")
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
