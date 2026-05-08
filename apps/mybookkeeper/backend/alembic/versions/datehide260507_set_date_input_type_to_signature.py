"""lease_template_placeholders: hide bare DATE from generate-lease form

The generate-lease form filters out ``input_type='signature'`` placeholders
because they're filled at signing time, not at generation. Bare ``[DATE]``
(distinct from ``[EFFECTIVE DATE]``) belongs in that same bucket — the
host shouldn't have to type a date that the signer writes by hand.

This migration updates existing rows where ``key = 'DATE'`` and
``input_type = 'date'`` (the legacy seed) to ``input_type = 'signature'``,
which:
  - Hides the field from the generate-lease form (matches LANDLORD/TENANT
    SIGNATURE behavior).
  - Continues to render as a blank underscore line via the renderer's
    DATE-specific augment rule (no renderer change needed).

Host customisations (rows where someone changed input_type or default_source
manually) are left alone.

Revision ID: datehide260507
Revises: dateblank260507
Create Date: 2026-05-07 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "datehide260507"
down_revision: Union[str, None] = "dateblank260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE lease_template_placeholders "
            "SET input_type = 'signature' "
            "WHERE key = 'DATE' "
            "  AND input_type = 'date'"
        ),
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE lease_template_placeholders "
            "SET input_type = 'date' "
            "WHERE key = 'DATE' "
            "  AND input_type = 'signature'"
        ),
    )
