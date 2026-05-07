"""lease_template_placeholders: backfill NUMBER OF DAYS computed_expr

The original template-extraction path hard-coded ``computed_expr=None``
when seeding placeholders, even for keys whose ``input_type`` was
``computed`` (e.g. ``NUMBER OF DAYS``). The renderer therefore left
``[NUMBER OF DAYS]`` as literal text in every generated lease.

This migration backfills the canonical expression for the ``NUMBER OF DAYS``
keys (``(MOVE-OUT DATE - MOVE-IN DATE).days``) on rows that still have
``computed_expr IS NULL``. Rows a host has customised (set to a different
expression) are left alone.

The downgrade nulls out rows whose ``computed_expr`` exactly matches the
canonical expression — including any host-set rows that happened to use the
same string. That's the deliberate trade for a clean rollback contract;
hosts can re-set their override after the next forward run.

Revision ID: nodexpr260507
Revises: legtenp260507
Create Date: 2026-05-07 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "nodexpr260507"
down_revision: Union[str, None] = "legtenp260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NUMBER_OF_DAYS_EXPR = "(MOVE-OUT DATE - MOVE-IN DATE).days"


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE lease_template_placeholders "
            "SET computed_expr = :expr "
            "WHERE input_type = 'computed' "
            "  AND computed_expr IS NULL "
            "  AND key IN (:k_space, :k_underscore)"
        ).bindparams(
            expr=_NUMBER_OF_DAYS_EXPR,
            k_space="NUMBER OF DAYS",
            k_underscore="NUMBER_OF_DAYS",
        ),
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE lease_template_placeholders "
            "SET computed_expr = NULL "
            "WHERE input_type = 'computed' "
            "  AND computed_expr = :expr "
            "  AND key IN (:k_space, :k_underscore)"
        ).bindparams(
            expr=_NUMBER_OF_DAYS_EXPR,
            k_space="NUMBER OF DAYS",
            k_underscore="NUMBER_OF_DAYS",
        ),
    )
