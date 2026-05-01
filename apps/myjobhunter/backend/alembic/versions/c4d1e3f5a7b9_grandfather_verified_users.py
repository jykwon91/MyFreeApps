"""grandfather existing users as verified

All users who registered before email verification was wired up are
set to is_verified=True so they are not locked out on deploy. New
registrations will go through the verification flow.

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-29 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d1e3f5a7b9"
down_revision: Union[str, None] = "c5e1f2a3b4c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text("UPDATE users SET is_verified = TRUE WHERE is_verified = FALSE")
    )


def downgrade() -> None:
    # Intentionally a no-op: we cannot know which users were genuinely
    # unverified vs grandfathered, so rolling back would incorrectly
    # lock out real users.
    pass
