"""grandfather existing users as verified

All users who registered before email verification was introduced are
set to is_verified=True so they are not locked out on deploy. New
registrations will go through the verification flow.

Revision ID: b7e9d3a14f02
Revises: e3bc2531d23e
Create Date: 2026-04-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b7e9d3a14f02'
down_revision: Union[str, None] = 'e3bc2531d23e'
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
