"""add inquiries domain (inquiries, inquiry_messages, inquiry_events)

Revision ID: d6f8b1a2c4e5
Revises: c5e7f9a1b3d5
Create Date: 2026-04-26

Phase 2 / PR 2.1a of the rentals expansion. See RENTALS_PLAN.md §5.2.

Conventions per RENTALS_PLAN.md §4.1:
- String + CheckConstraint for stage / source / direction columns (not SAEnum).
- Dual scope: organization_id + user_id.
- Soft-delete via deleted_at (Inquiry only — messages and events are immutable).
- DateTime(timezone=True) with server_default = func.now().
- UUID primary keys.
- ``last_activity_at`` is intentionally NOT a column on inquiries — inbox sort
  uses a lateral join on inquiry_messages with covering index
  (inquiry_id, created_at DESC).
- PII columns (inquirer_*, from_address, to_address) are stored as Fernet
  ciphertext via the ``EncryptedString`` SQLAlchemy TypeDecorator. The DB
  stores plain TEXT — no DDL difference from any other String column.
- ``key_version smallint`` lets future key rotation re-encrypt rows
  non-destructively per RENTALS_PLAN.md §8.2.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d6f8b1a2c4e5"
down_revision: Union[str, None] = "c5e7f9a1b3d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # inquiries
    # ------------------------------------------------------------------
    op.create_table(
        "inquiries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("listing_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("external_inquiry_id", sa.String(length=100), nullable=True),
        # PII columns — stored as TEXT, encrypted application-side via EncryptedString.
        sa.Column("inquirer_name", sa.Text(), nullable=True),
        sa.Column("inquirer_email", sa.Text(), nullable=True),
        sa.Column("inquirer_phone", sa.Text(), nullable=True),
        sa.Column("inquirer_employer", sa.Text(), nullable=True),
        sa.Column("desired_start_date", sa.Date(), nullable=True),
        sa.Column("desired_end_date", sa.Date(), nullable=True),
        sa.Column("stage", sa.String(length=40), nullable=False, server_default="new"),
        sa.Column("gut_rating", sa.SmallInteger(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("email_message_id", sa.String(length=255), nullable=True),
        sa.Column("key_version", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["listing_id"], ["listings.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "source IN ('FF', 'TNH', 'direct', 'other')",
            name="chk_inquiry_source",
        ),
        sa.CheckConstraint(
            "stage IN ('new', 'triaged', 'replied', 'screening_requested', "
            "'video_call_scheduled', 'approved', 'declined', 'converted', 'archived')",
            name="chk_inquiry_stage",
        ),
        sa.CheckConstraint(
            "gut_rating IS NULL OR (gut_rating BETWEEN 1 AND 5)",
            name="chk_inquiry_gut_rating",
        ),
    )
    op.create_index("ix_inquiries_organization_id", "inquiries", ["organization_id"])
    op.create_index("ix_inquiries_user_id", "inquiries", ["user_id"])
    op.create_index("ix_inquiries_listing_id", "inquiries", ["listing_id"])
    op.create_index(
        "ix_inquiries_org_stage_active",
        "inquiries",
        ["organization_id", "stage"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_inquiries_org_received_active",
        "inquiries",
        ["organization_id", "received_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_inquiries_org_listing",
        "inquiries",
        ["organization_id", "listing_id"],
    )
    # Partial UNIQUE: dedup by Gmail message_id, scoped per user (so two
    # users in the same org parsing the same forwarded email is still a conflict).
    op.create_index(
        "uq_inquiries_user_email_message",
        "inquiries",
        ["user_id", "email_message_id"],
        unique=True,
        postgresql_where=sa.text("email_message_id IS NOT NULL"),
    )
    # Partial UNIQUE: dedup by (org, source, external_id) — two orgs can
    # independently track FF inquiry "I-123".
    op.create_index(
        "uq_inquiries_org_source_external",
        "inquiries",
        ["organization_id", "source", "external_inquiry_id"],
        unique=True,
        postgresql_where=sa.text("external_inquiry_id IS NOT NULL"),
    )

    # ------------------------------------------------------------------
    # inquiry_messages
    # ------------------------------------------------------------------
    op.create_table(
        "inquiry_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("inquiry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("from_address", sa.Text(), nullable=True),
        sa.Column("to_address", sa.Text(), nullable=True),
        sa.Column("subject", sa.String(length=500), nullable=True),
        sa.Column("raw_email_body", sa.Text(), nullable=True),
        sa.Column("parsed_body", sa.Text(), nullable=True),
        sa.Column("email_message_id", sa.String(length=255), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("key_version", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "direction IN ('inbound', 'outbound')",
            name="chk_inquiry_message_direction",
        ),
        sa.CheckConstraint(
            "channel IN ('email', 'sms', 'in_app')",
            name="chk_inquiry_message_channel",
        ),
    )
    op.create_index("ix_inquiry_messages_inquiry_id", "inquiry_messages", ["inquiry_id"])
    # Covering index for the inbox lateral join — most-recent message per inquiry.
    op.create_index(
        "ix_inquiry_messages_inquiry_created",
        "inquiry_messages",
        ["inquiry_id", "created_at"],
    )
    op.create_index(
        "ix_inquiry_messages_email_message_id",
        "inquiry_messages",
        ["email_message_id"],
    )

    # ------------------------------------------------------------------
    # inquiry_events
    # ------------------------------------------------------------------
    op.create_table(
        "inquiry_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("inquiry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("actor", sa.String(length=20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "event_type IN ('received', 'new', 'triaged', 'replied', "
            "'screening_requested', 'video_call_scheduled', 'approved', "
            "'declined', 'converted', 'archived')",
            name="chk_inquiry_event_type",
        ),
        sa.CheckConstraint(
            "actor IN ('host', 'system', 'applicant')",
            name="chk_inquiry_event_actor",
        ),
    )
    op.create_index("ix_inquiry_events_inquiry_id", "inquiry_events", ["inquiry_id"])
    op.create_index(
        "ix_inquiry_events_inquiry_occurred",
        "inquiry_events",
        ["inquiry_id", "occurred_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_inquiry_events_inquiry_occurred", table_name="inquiry_events")
    op.drop_index("ix_inquiry_events_inquiry_id", table_name="inquiry_events")
    op.drop_table("inquiry_events")

    op.drop_index("ix_inquiry_messages_email_message_id", table_name="inquiry_messages")
    op.drop_index("ix_inquiry_messages_inquiry_created", table_name="inquiry_messages")
    op.drop_index("ix_inquiry_messages_inquiry_id", table_name="inquiry_messages")
    op.drop_table("inquiry_messages")

    op.drop_index("uq_inquiries_org_source_external", table_name="inquiries")
    op.drop_index("uq_inquiries_user_email_message", table_name="inquiries")
    op.drop_index("ix_inquiries_org_listing", table_name="inquiries")
    op.drop_index("ix_inquiries_org_received_active", table_name="inquiries")
    op.drop_index("ix_inquiries_org_stage_active", table_name="inquiries")
    op.drop_index("ix_inquiries_listing_id", table_name="inquiries")
    op.drop_index("ix_inquiries_user_id", table_name="inquiries")
    op.drop_index("ix_inquiries_organization_id", table_name="inquiries")
    op.drop_table("inquiries")
