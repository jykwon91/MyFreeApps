"""mark orphan 'done' email_queue rows as 'skipped'

Backstop for the silent-skip lockout: prior to PR introducing
``EmailQueue.status='skipped'``, any email that was fetched but
classified as a payment_confirmation duplicate (or otherwise produced
zero Documents) was marked ``done`` even though no Document survived.
The discovery filter then permanently excluded the message_id from
re-fetch, so a future prompt improvement could never give the email
another chance.

This migration converts every ``done`` queue row that has NO matching
Document (joined on ``email_message_id``) to ``skipped`` so the
discovery filter (now status-aware) re-fetches them on the next sync.

Revision ID: skp260504
Revises: rcpt260504
Create Date: 2026-05-04 19:30:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "skp260504"
down_revision: Union[str, None] = "rcpt260504"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Convert done-with-no-document rows to skipped. raw_content is not
    # touched (skipped rows already have raw_content cleared at mark_done
    # time, so the column is null for these rows).
    op.execute(
        """
        UPDATE email_queue eq
           SET status = 'skipped',
               error  = COALESCE(eq.error, 'auto-marked skipped: no Document linked at migration time')
         WHERE eq.status = 'done'
           AND NOT EXISTS (
               SELECT 1 FROM documents d
                WHERE d.email_message_id = eq.message_id
                  AND d.organization_id  = eq.organization_id
           );
        """
    )


def downgrade() -> None:
    # Revert is conservative — only flip rows we marked in upgrade.
    op.execute(
        """
        UPDATE email_queue
           SET status = 'done',
               error  = NULL
         WHERE status = 'skipped'
           AND error  = 'auto-marked skipped: no Document linked at migration time';
        """
    )
