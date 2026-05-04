"""unlock stuck P2P payment emails for re-fetch

After PR chain #226 → #229 → #231, peer-to-peer payment emails
(Zelle, Venmo, Cash App, etc.) that were silently classified as
'payment_confirmation' by the OLD prompt and marked email_queue.status
= 'done' are now permanently locked out of re-fetch — even though the
new prompt + persistence carve-out from #226 would extract them
correctly.

Surgical fix: DELETE email_queue rows where (a) the subject matches a
P2P payment notification pattern, (b) the queue row has NO matching
Document. Deletion (rather than status-flip) gets the rows fully out
of the dedup set in email_queue_repo.get_message_ids; on the next sync
those message_ids will be discovered as new and processed by the
current prompt.

The pattern is intentionally narrow — only matches subjects with
'zelle', 'venmo', 'cash app', 'cashapp', 'paypal', 'received money',
'sent you money', 'you received money', 'paid you', or 'deposit alert'.
Vello statements, payment_confirmation bill notifications, and other
genuine 0-document skips remain locked.

Revision ID: p2punlock260504
Revises: skp260504r
Create Date: 2026-05-04 20:15:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "p2punlock260504"
down_revision: Union[str, None] = "skp260504r"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM email_queue eq
         WHERE eq.email_subject ~* '(zelle|venmo|cash[ ]?app|paypal|received money|sent you money|you received money|paid you|deposit alert)'
           AND NOT EXISTS (
               SELECT 1 FROM documents d
                WHERE d.email_message_id = eq.message_id
                  AND d.organization_id  = eq.organization_id
           );
        """
    )


def downgrade() -> None:
    # No-op: deletions can't be reliably reconstructed. Operators who
    # need to rollback should restore from backup.
    pass
