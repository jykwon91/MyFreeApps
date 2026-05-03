"""Add calendar_email_review_queue and calendar_listing_blocklist tables.

Phase 2 Gmail booking auto-fill: when inbound reservation emails reference a
channel listing the user hasn't added to MBK, the parsed payload lands in the
review queue instead of being silently dropped. The user resolves each entry
once (add to MBK → creates the booking, or ignore forever → adds to blocklist).

calendar_email_review_queue:
  One row per unrecognised reservation email (deduped on email_message_id per
  user). Status moves:  pending → resolved | ignored.  Soft-delete via
  deleted_at for user-initiated dismissal without acting.

calendar_listing_blocklist:
  One row per (user, channel, external listing identifier) the user has chosen
  to ignore. Future inbound emails matching a blocklisted identifier are
  silently dropped.

Revision ID: cal260503
Revises: tenend260503
Create Date: 2026-05-03 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "cal260503"
down_revision: Union[str, None] = "tenend260503"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- calendar_email_review_queue ------------------------------------------
    op.create_table(
        "calendar_email_review_queue",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        # Gmail message ID — dedup guard per user. NOT globally unique: two
        # different users may independently receive the same broadcast email.
        sa.Column("email_message_id", sa.String(255), nullable=False),
        # Channel slug (airbnb / furnished_finder / booking_com / vrbo).
        sa.Column("source_channel", sa.String(40), nullable=False),
        # Claude-extracted payload (dates, price, guest name, listing ref, etc.).
        # Full email body is NEVER stored here — only extracted fields.
        sa.Column("parsed_payload", postgresql.JSONB, nullable=False,
                  server_default="{}"),
        sa.Column("status", sa.String(10), nullable=False,
                  server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'resolved', 'ignored')",
            name="chk_review_queue_status",
        ),
    )

    # Unique per (user, message) — prevents duplicate queue entries from
    # re-running the same email scan.
    op.create_index(
        "uq_review_queue_user_message_id",
        "calendar_email_review_queue",
        ["user_id", "email_message_id"],
        unique=True,
    )
    # Efficient fetch of pending items for a given org.
    op.create_index(
        "ix_review_queue_org_status",
        "calendar_email_review_queue",
        ["organization_id", "status"],
    )

    # -- calendar_listing_blocklist -------------------------------------------
    op.create_table(
        "calendar_listing_blocklist",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        # Channel slug that issued the external listing identifier.
        sa.Column("source_channel", sa.String(40), nullable=False),
        # The opaque identifier the channel uses for this listing in emails
        # (e.g. Airbnb listing number, FF property ID).
        sa.Column("source_listing_id", sa.String(255), nullable=False),
        # Free-text reason captured at ignore time (optional).
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE",
        ),
        # One blocklist entry per (user, channel, listing identifier) — ignoring
        # the same listing twice is a no-op.
        sa.UniqueConstraint(
            "user_id", "source_channel", "source_listing_id",
            name="uq_blocklist_user_channel_listing",
        ),
    )

    op.create_index(
        "ix_blocklist_user_channel",
        "calendar_listing_blocklist",
        ["user_id", "source_channel"],
    )


def downgrade() -> None:
    op.drop_index("ix_blocklist_user_channel",
                  table_name="calendar_listing_blocklist")
    op.drop_table("calendar_listing_blocklist")

    op.drop_index("ix_review_queue_org_status",
                  table_name="calendar_email_review_queue")
    op.drop_index("uq_review_queue_user_message_id",
                  table_name="calendar_email_review_queue")
    op.drop_table("calendar_email_review_queue")
