"""add welcome_manual_sends

Revision ID: wmanualsend260530
Revises: wmanualimg260530
Create Date: 2026-05-30

Guest welcome manual — PR 3 (PDF + email delivery). One row per send attempt,
attached to a manual, cascade-deleted with it.

Conventions:
- ``recipient_email`` / ``recipient_name`` are guest PII stored as Fernet
  ciphertext via the ``EncryptedString`` TypeDecorator. The DB column is plain
  TEXT (ciphertext is longer than the plaintext bound) — no DDL difference from
  any other text column, same as the inquiries domain.
- ``key_version smallint`` lets future key rotation re-encrypt rows
  non-destructively.
- ``status`` is String(20) + CheckConstraint (never SQLAlchemy Enum).
- Tenant isolation is via the parent manual FK — no organization_id/user_id
  column (mirrors welcome_manual_section_images).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "wmanualsend260530"
down_revision: Union[str, None] = "wmanualimg260530"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "welcome_manual_sends",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("manual_id", postgresql.UUID(as_uuid=True), nullable=False),
        # PII columns — stored as TEXT, encrypted application-side via EncryptedString.
        sa.Column("recipient_email", sa.Text(), nullable=False),
        sa.Column("recipient_name", sa.Text(), nullable=True),
        sa.Column("key_version", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error_reason", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["manual_id"], ["welcome_manuals.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "status IN ('sent', 'failed', 'skipped')",
            name="chk_welcome_manual_send_status",
        ),
    )
    op.create_index(
        "ix_welcome_manual_sends_manual_id",
        "welcome_manual_sends",
        ["manual_id"],
    )
    op.create_index(
        "ix_welcome_manual_sends_manual_created",
        "welcome_manual_sends",
        ["manual_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_welcome_manual_sends_manual_created",
        table_name="welcome_manual_sends",
    )
    op.drop_index(
        "ix_welcome_manual_sends_manual_id",
        table_name="welcome_manual_sends",
    )
    op.drop_table("welcome_manual_sends")
