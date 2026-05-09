"""add gmail_skipped_messages table

Revision ID: gskmsg260508
Revises: chsync260508
Create Date: 2026-05-08 00:00:00.000000

Audit log table for Gmail message envelope fetches that fail during discovery.
Previously these were silently skipped (bare except + continue); now every skip
lands a row here so the operator can see which user/message combinations are
failing and at what frequency. Partial sync behavior is preserved — the sync
continues with the remaining messages.

Renamed from the original `a1b2c3d4e5f6` revision id (which collided with
`a1b2c3d4e5f6_add_invoice_line_items.py`) and re-pointed off `chsync260508`
to linearize the chain after the parallel head left by PR #508 + PR #526.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "gskmsg260508"
down_revision: Union[str, None] = "chsync260508"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gmail_skipped_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("gmail_message_id", sa.String(255), nullable=False),
        sa.Column("exception_type", sa.String(120), nullable=False),
        sa.Column("exception_message", sa.Text(), nullable=False),
        sa.Column(
            "skipped_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_gmail_skipped_messages_organization_id",
        "gmail_skipped_messages",
        ["organization_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_gmail_skipped_messages_organization_id",
        table_name="gmail_skipped_messages",
    )
    op.drop_table("gmail_skipped_messages")
