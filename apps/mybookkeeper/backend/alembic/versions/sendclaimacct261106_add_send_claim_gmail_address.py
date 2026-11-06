"""record which Gmail address each claimed send went through

A Gmail reconnect can switch the integration to a different Google account.
A ``sending`` reply or receipt claim is settled by searching the connected
mailbox for its Message-ID, so after a switch the search looks in the wrong
mailbox, finds nothing, and the send is repeated from the new account. Storing
the address on the claim lets settlement see the switch and stop.

- ``integrations.gmail_address`` — the connected account's address, from
  Gmail's getProfile. ``pii_key_version`` is its key generation (the existing
  ``key_version`` covers the OAuth tokens, a separate key family).
- ``inquiry_reply_sends.sender_gmail_address`` and
  ``pending_rent_receipts.sender_gmail_address`` (+ ``key_version``) — the
  address a claim sent through.

The CHECKs are added NOT VALID: claims taken before this migration have no
address and are settled against the connected account, as before.

Purely additive. The address columns are TEXT: they hold Fernet ciphertext
(``EncryptedString``), which is longer than the plaintext.

Revision ID: sendclaimacct261106
Revises: inqreplyclaim261105
Create Date: 2026-11-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "sendclaimacct261106"
down_revision: Union[str, None] = "inqreplyclaim261105"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def _key_version(name: str) -> sa.Column:
    return sa.Column(name, sa.SmallInteger(), nullable=False, server_default=sa.text("1"))


def upgrade() -> None:
    op.add_column("integrations", sa.Column("gmail_address", sa.Text(), nullable=True))
    op.add_column("integrations", _key_version("pii_key_version"))

    for table in ("inquiry_reply_sends", "pending_rent_receipts"):
        op.add_column(table, sa.Column("sender_gmail_address", sa.Text(), nullable=True))
        op.add_column(table, _key_version("key_version"))

    op.execute(
        "ALTER TABLE inquiry_reply_sends ADD CONSTRAINT chk_inquiry_reply_send_sending_account "
        "CHECK (status <> 'sending' OR sender_gmail_address IS NOT NULL) NOT VALID"
    )
    op.execute(
        "ALTER TABLE pending_rent_receipts ADD CONSTRAINT chk_pending_rent_receipt_sending_account "
        "CHECK (status <> 'sending' OR sender_gmail_address IS NOT NULL) NOT VALID"
    )


def downgrade() -> None:
    op.drop_constraint("chk_pending_rent_receipt_sending_account", "pending_rent_receipts", type_="check")
    op.drop_constraint("chk_inquiry_reply_send_sending_account", "inquiry_reply_sends", type_="check")
    for table in ("pending_rent_receipts", "inquiry_reply_sends"):
        op.drop_column(table, "key_version")
        op.drop_column(table, "sender_gmail_address")
    op.drop_column("integrations", "pii_key_version")
    op.drop_column("integrations", "gmail_address")
