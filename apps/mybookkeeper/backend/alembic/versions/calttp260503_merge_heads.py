"""merge cal260503 + totp260503 heads

Revision ID: calttp260503
Revises: cal260503, totp260503
Create Date: 2026-05-03 17:11:35.500091

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'calttp260503'
down_revision: Union[str, None] = ('cal260503', 'totp260503')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
