"""merge: moveout260507 + nodexpr260507 into a single head

PR #380 (``moveout260507``) and PR #381 (``nodexpr260507``) were both
authored on top of ``legtenp260507`` and merged to main back-to-back.
Alembic refuses to ``upgrade head`` with more than one head, so every
deploy after the second merge fails with exit 255 in the migrate
service before the new images can promote.

This is a no-op merge revision — it only joins the two parents into
one head. Both feature migrations have already run (or will run) in
either order; alembic's stamp + version graph just needs a single
descendant.

Revision ID: mrgheads260507
Revises: moveout260507, nodexpr260507
Create Date: 2026-05-07 06:00:00.000000
"""
from typing import Sequence, Union

revision: str = "mrgheads260507"
down_revision: Union[str, Sequence[str], None] = (
    "moveout260507",
    "nodexpr260507",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
