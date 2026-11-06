"""add inquiry_reply_sends (claim a reply before emailing it)

One row per reply send attempt that carries a client request id. The UNIQUE on
(inquiry_id, client_request_id) is what keeps a retried or doubled send from
emailing the inquirer twice. The RFC 822 Message-ID stored at claim lets a send
whose outcome was unknown be settled by looking it up in Gmail.

Purely additive — no existing table is touched.

Revision ID: inqreplyclaim261105
Revises: rcptclaim261105
Create Date: 2026-11-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "inqreplyclaim261105"
down_revision: Union[str, None] = "rcptclaim261105"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Kept in lockstep with app/core/inquiry_enums.py INQUIRY_REPLY_SEND_STATUSES.
_STATUSES_SQL = "('sending', 'sent')"


def upgrade() -> None:
    op.create_table(
        "inquiry_reply_sends",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "inquiry_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inquiries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("send_message_id", sa.String(length=255), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "inquiry_message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inquiry_messages.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "inquiry_id", "client_request_id", name="uq_inquiry_reply_sends_inquiry_request",
        ),
        sa.UniqueConstraint("inquiry_message_id", name="inquiry_reply_sends_inquiry_message_id_key"),
        sa.CheckConstraint(f"status IN {_STATUSES_SQL}", name="chk_inquiry_reply_send_status"),
        sa.CheckConstraint(
            "(status = 'sent') = (inquiry_message_id IS NOT NULL)",
            name="chk_inquiry_reply_send_sent_has_message",
        ),
    )


def downgrade() -> None:
    op.drop_table("inquiry_reply_sends")
