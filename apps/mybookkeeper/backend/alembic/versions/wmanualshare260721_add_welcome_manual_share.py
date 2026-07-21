"""add welcome_manual share link (token + PIN)

Revision ID: wmanualshare260721
Revises: wmanualplace260721
Create Date: 2026-07-21

Guest welcome manual — PIN-protected public share link. A host enables a
public link for a manual; a guest opens ``/guide/<share_token>``, enters the
PIN, and sees a read-only guest-safe projection of the manual.

Conventions:
- ``share_token`` is an opaque URL segment (``secrets.token_urlsafe``),
  UNIQUE — Postgres treats NULLs as distinct so a plain unique constraint is
  correct even though most manuals never enable sharing.
- ``share_pin`` is stored as TEXT, encrypted application-side via the
  ``EncryptedString`` TypeDecorator (Fernet ciphertext is longer than the
  4-digit plaintext bound) — reversible, NOT a one-way hash, because the host
  must be able to view/copy the current PIN to re-share it.
- ``key_version smallint`` lets future key rotation re-encrypt rows
  non-destructively (same convention as every other EncryptedString table).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "wmanualshare260721"
down_revision: Union[str, None] = "wmanualplace260721"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "welcome_manuals",
        sa.Column("share_token", sa.String(length=48), nullable=True),
    )
    op.create_unique_constraint(
        "uq_welcome_manuals_share_token",
        "welcome_manuals",
        ["share_token"],
    )
    op.add_column(
        "welcome_manuals",
        # PII-adjacent secret — stored as TEXT, encrypted application-side.
        sa.Column("share_pin", sa.Text(), nullable=True),
    )
    op.add_column(
        "welcome_manuals",
        sa.Column("key_version", sa.SmallInteger(), nullable=False, server_default="1"),
    )
    # Guest-PIN brute-force lockout — per-manual (per share token), NOT per-IP.
    # Mirrors the account-lockout columns on ``users`` (failed_login_count /
    # locked_until). Incremented only on a wrong PIN, reset on success.
    op.add_column(
        "welcome_manuals",
        sa.Column(
            "failed_unlock_count", sa.SmallInteger(), nullable=False, server_default="0",
        ),
    )
    op.add_column(
        "welcome_manuals",
        sa.Column("unlock_locked_until", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("welcome_manuals", "unlock_locked_until")
    op.drop_column("welcome_manuals", "failed_unlock_count")
    op.drop_column("welcome_manuals", "key_version")
    op.drop_column("welcome_manuals", "share_pin")
    op.drop_constraint(
        "uq_welcome_manuals_share_token",
        "welcome_manuals",
        type_="unique",
    )
    op.drop_column("welcome_manuals", "share_token")
