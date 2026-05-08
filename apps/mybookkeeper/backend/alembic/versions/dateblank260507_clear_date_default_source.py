"""lease_template_placeholders: clear default_source for bare DATE key

``[DATE]`` next to a signature line should be left blank for the physical
signer to fill in — the same treatment as ``[LANDLORD SIGNATURE]`` /
``[TENANT SIGNATURE]``. Previously ``default_source_map`` mapped the bare
``DATE`` key to ``"today"``, so generated leases auto-filled today's date
where a blank signing line should appear.

This migration clears ``default_source`` on existing rows where
``key = 'DATE'`` and ``default_source = 'today'``. Rows the host has
already customised to a non-"today" source are left alone.

``EFFECTIVE DATE`` (a document-level date auto-filled at generation time)
is deliberately NOT touched — only the bare ``DATE`` key is cleared.

Revision ID: dateblank260507
Revises: leasemulti260507
Create Date: 2026-05-07 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "dateblank260507"
down_revision: Union[str, None] = "leasemulti260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE lease_template_placeholders "
            "SET default_source = NULL "
            "WHERE key = :key "
            "  AND default_source = :old_source"
        ).bindparams(
            key="DATE",
            old_source="today",
        ),
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE lease_template_placeholders "
            "SET default_source = :old_source "
            "WHERE key = :key "
            "  AND default_source IS NULL"
        ).bindparams(
            key="DATE",
            old_source="today",
        ),
    )
