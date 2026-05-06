"""platform_invites table — admin-issued email invites to register on MJH.

Platform-level invite (not org-scoped, since MJH has no orgs). Admin sends
an invite to a recipient email; the recipient gets a tokenized link that
pre-binds the registration to that email and consumes the invite on
acceptance.

Columns:
  id            — UUID PK
  email         — the recipient address (citext-ish via lower() unique idx)
  token         — opaque urlsafe string, unique
  expires_at    — created_at + 7 days; 410 Gone after this
  accepted_at   — nullable; non-null = consumed (single-use)
  accepted_by   — nullable FK to users.id; set when an account claims the invite
  created_by    — FK to users.id (the admin who sent it); CASCADE to clean
                  up if the admin's account is deleted
  created_at    — timestamptz, server default now()
  updated_at    — timestamptz, server default now()

Indexes:
  ix_platform_invites_token (UNIQUE) — every public lookup is by token
  ix_platform_invites_email_pending — partial idx for "list outstanding by
    email" which the create flow uses to detect already-pending invites

CheckConstraint:
  chk_platform_invites_accepted_after_created — accepted_at IS NULL OR
  accepted_at >= created_at (sanity gate against clock-skew clean-up scripts)

Revision ID: inv260505
Revises: refine260505
Create Date: 2026-05-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "inv260505"
down_revision: Union[str, None] = "demo260505"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platform_invites",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "accepted_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "accepted_at IS NULL OR accepted_at >= created_at",
            name="chk_platform_invites_accepted_after_created",
        ),
    )
    op.create_index(
        "ix_platform_invites_token",
        "platform_invites",
        ["token"],
        unique=True,
    )
    # Partial index — only un-accepted, un-expired invites are interesting
    # for the "is there already a pending invite for this email" check
    # the create flow runs.
    op.create_index(
        "ix_platform_invites_email_pending",
        "platform_invites",
        ["email"],
        unique=False,
        postgresql_where=sa.text("accepted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_platform_invites_email_pending", table_name="platform_invites")
    op.drop_index("ix_platform_invites_token", table_name="platform_invites")
    op.drop_table("platform_invites")
