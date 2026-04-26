"""merge migration heads

Revision ID: ba43787beab3
Revises: 0391e4833c92, v6w7x8y9z0a1
Create Date: 2026-04-03 12:02:35.674521

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ba43787beab3'
down_revision: Union[str, None] = ('0391e4833c92', 'v6w7x8y9z0a1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
