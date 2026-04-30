"""Rename users.totp_secret_encrypted -> totp_secret (TOTP enrollment, PR C5)

The ``users`` table was provisioned in 0001 with three TOTP columns reserved
for the deferred 2FA feature: ``totp_secret_encrypted``, ``totp_enabled``,
and ``totp_recovery_codes``. PR C5 wires the actual feature, and the User
model wraps both ``totp_secret`` and ``totp_recovery_codes`` with the M2
``EncryptedString`` ``TypeDecorator`` (Fernet ciphertext) — the SQL column
type stays a plain ``String`` because ciphertext is just a string at the
DB layer.

The only schema change here is the column rename — ``totp_secret_encrypted``
was a misleading name (the encryption is now a property of the column type,
not the column name). No data migration is required: no MJH user has
enrolled in TOTP yet, so every value of this column is NULL in every
environment.

The ``auth_events`` table that this PR's audit logging needs is provisioned
by sibling migration ``a1b2c3d4e5f6_add_account_lockout_and_auth_events.py``
(merged in PR C3). This migration runs AFTER that one.

Revision ID: 0002
Revises: a1b2c3d4e5f6
Create Date: 2026-04-29 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "totp_secret_encrypted",
        new_column_name="totp_secret",
        existing_type=sa.String(500),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "totp_secret",
        new_column_name="totp_secret_encrypted",
        existing_type=sa.String(500),
        existing_nullable=True,
    )
