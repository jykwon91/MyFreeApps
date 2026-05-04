"""revert the over-aggressive 'skipped' flip from skp260504

The skp260504 migration flipped every 'done' email_queue row that had
no matching Document to 'skipped' so they would be re-fetched. Intent
was to give a previously-mis-skipped Zelle email another chance with
the new P2P prompt — but the side effect was to also re-fetch every
legitimate 0-document case (dedup-identified duplicates, low-confidence
extractions, real payment-confirmation notifications). Each sync now
burned Claude tokens re-extracting them.

This migration reverts that flip — only rows whose error column matches
the marker that skp260504 wrote are flipped back to 'done', so manual
'skipped' marks (none yet, but possible in the future) are preserved.

Going forward, the application code (email_extraction_service) marks
0-document extractions as 'done' regardless, so the lockout is
restored to its pre-skp260504 behavior.

Revision ID: skp260504r
Revises: skp260504
Create Date: 2026-05-04 19:55:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "skp260504r"
down_revision: Union[str, None] = "skp260504"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE email_queue
           SET status = 'done',
               error  = NULL
         WHERE status = 'skipped'
           AND error  = 'auto-marked skipped: no Document linked at migration time';
        """
    )


def downgrade() -> None:
    # Re-apply the flip (matches skp260504.upgrade's behavior).
    op.execute(
        """
        UPDATE email_queue eq
           SET status = 'skipped',
               error  = 'auto-marked skipped: no Document linked at migration time'
         WHERE eq.status = 'done'
           AND NOT EXISTS (
               SELECT 1 FROM documents d
                WHERE d.email_message_id = eq.message_id
                  AND d.organization_id  = eq.organization_id
           );
        """
    )
