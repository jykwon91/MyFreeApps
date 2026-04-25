"""Encrypt OAuth tokens in integrations table.

Adds access_token_encrypted and refresh_token_encrypted (Text, nullable)
plus key_version (smallint, default 1). Backfills existing rows by
encrypting any plaintext values, skipping already-encrypted rows.
Drops the old plaintext columns after backfill is complete.

This migration is intentionally irreversible. The application will fail
to start if ENCRYPTION_KEY is missing from the environment.

Revision ID: aa1bb2cc3dd4
Revises: z0a1b2c3d4e5
Create Date: 2026-04-23 00:00:00.000000

"""
import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "aa1bb2cc3dd4"
down_revision: Union[str, None] = "z0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger(__name__)

_BATCH_SIZE = 100


def _is_fernet_token(value: str) -> bool:
    """Fernet tokens are base64url strings starting with 'gAAAAA'.

    This heuristic lets us skip rows that were already encrypted by
    the application before this migration ran.
    """
    return value.startswith("gAAAAA")


def upgrade() -> None:
    # Import here so Alembic can call the migration without importing the
    # full FastAPI app graph (the settings object is safe to import in
    # migration context as long as ENCRYPTION_KEY is present in .env).
    from app.core.security import encrypt_token

    conn = op.get_bind()

    # Step 1: add the new encrypted columns and key_version.
    op.add_column("integrations", sa.Column("access_token_encrypted", sa.Text(), nullable=True))
    op.add_column("integrations", sa.Column("refresh_token_encrypted", sa.Text(), nullable=True))
    op.add_column(
        "integrations",
        sa.Column("key_version", sa.SmallInteger(), nullable=False, server_default="1"),
    )

    # Step 2: backfill in batches.
    # Only process rows where access_token_encrypted IS NULL (idempotent).
    offset = 0
    total_processed = 0
    total_skipped = 0

    while True:
        rows = conn.execute(
            sa.text(
                "SELECT id, access_token, refresh_token "
                "FROM integrations "
                "WHERE access_token_encrypted IS NULL "
                "ORDER BY id "
                "LIMIT :limit OFFSET :offset"
            ),
            {"limit": _BATCH_SIZE, "offset": offset},
        ).fetchall()

        if not rows:
            break

        for row in rows:
            row_id, access_token, refresh_token = row

            # Encrypt access_token if it exists.
            if access_token:
                if _is_fernet_token(access_token):
                    # Already encrypted by application code before this migration.
                    encrypted_access = access_token
                    total_skipped += 1
                else:
                    encrypted_access = encrypt_token(access_token)
                    total_processed += 1
            else:
                encrypted_access = None

            # Encrypt refresh_token if it exists.
            if refresh_token:
                if _is_fernet_token(refresh_token):
                    encrypted_refresh = refresh_token
                else:
                    encrypted_refresh = encrypt_token(refresh_token)
            else:
                encrypted_refresh = None

            conn.execute(
                sa.text(
                    "UPDATE integrations "
                    "SET access_token_encrypted = :enc_access, "
                    "    refresh_token_encrypted = :enc_refresh "
                    "WHERE id = :id"
                ),
                {
                    "enc_access": encrypted_access,
                    "enc_refresh": encrypted_refresh,
                    "id": row_id,
                },
            )

        logger.info(
            "encrypt_integration_tokens: backfilled batch at offset=%d "
            "(encrypted=%d, already_encrypted=%d)",
            offset,
            total_processed,
            total_skipped,
        )
        offset += _BATCH_SIZE

    logger.info(
        "encrypt_integration_tokens: backfill complete "
        "(encrypted=%d, already_encrypted=%d)",
        total_processed,
        total_skipped,
    )

    # Step 3: make access_token_encrypted NOT NULL now that all rows have a value.
    # Rows with a NULL access_token remain NULL in the encrypted column (disconnected integrations).
    # We cannot make the column NOT NULL because existing rows may have had NULL access_token.

    # Step 4: drop the old plaintext columns.
    op.drop_column("integrations", "access_token")
    op.drop_column("integrations", "refresh_token")


def downgrade() -> None:
    raise NotImplementedError(
        "This migration is intentionally irreversible. "
        "Restore from backup if rollback is needed: "
        "see deploy/DATABASE_BACKUP_RECOVERY.md"
    )
