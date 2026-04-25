"""merge is_demo branch into main chain

Revision ID: 50ea758245ee
Revises: 8368c5100728, u5v6w7x8y9z0
Create Date: 2026-04-01 13:22:40.564093

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '50ea758245ee'
down_revision: Union[str, None] = ('8368c5100728', 'u5v6w7x8y9z0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
