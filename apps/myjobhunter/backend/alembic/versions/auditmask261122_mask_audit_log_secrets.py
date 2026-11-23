"""Mask secrets the audit listener wrote to audit_logs in cleartext

Revision ID: auditmask261122
Revises: researchclaim261121
Create Date: 2026-11-22 00:00:00.000000

PR #2623 removed the import that registered this app's audit masking sets, so
the audit listener ran with nothing registered: it copied the values of
sensitive columns (password hashes, decrypted TOTP secrets and recovery
codes) into audit_logs, and audited tables and columns it is meant
to skip. This replaces every such old_value / new_value with the mask the
listener writes for a sensitive column. Only those values change: the rows,
and every other column's values, are kept. A NULL stays NULL, as the listener
writes for an update to or from NULL. Running it again changes nothing.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.engine import Connection

from alembic import op

revision: str = "auditmask261122"
down_revision: Union[str, None] = "researchclaim261121"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies as of this revision, so the migration never changes meaning:
# the listener's mask (platform_shared.core.audit_erasure_constants
# .MASKED_AUDIT_VALUE) and app/core/audit.py's sensitive fields, skip fields
# and skip tables. A skip field or skip table should have no audit rows at all;
# its values are masked rather than its rows deleted.
_MASK = "***"
# Account erasure already replaced these values; keep its marker so the erasure stays recorded.
_ERASED = "[erased]"
_FIELDS = (
    "hashed_password",
    "totp_recovery_codes",
    "totp_secret",
    "encrypted_credentials",
)
_TABLES = (
    "auth_events",
    "extraction_logs",
    "refresh_sessions",
    "resume_upload_jobs",
)

_MASK_VALUES = sa.text(
    """
    UPDATE audit_logs
    SET old_value = CASE WHEN old_value IS NULL OR old_value IN (:mask, :erased) THEN old_value ELSE :mask END,
        new_value = CASE WHEN new_value IS NULL OR new_value IN (:mask, :erased) THEN new_value ELSE :mask END
    WHERE (field_name IN :fields OR table_name IN :tables)
      AND (
        (old_value IS NOT NULL AND old_value NOT IN (:mask, :erased))
        OR (new_value IS NOT NULL AND new_value NOT IN (:mask, :erased))
      )
    """
).bindparams(sa.bindparam("fields", expanding=True), sa.bindparam("tables", expanding=True))


def mask_audit_log_secrets(connection: Connection) -> None:
    connection.execute(_MASK_VALUES, {"mask": _MASK, "erased": _ERASED, "fields": list(_FIELDS), "tables": list(_TABLES)})


def upgrade() -> None:
    mask_audit_log_secrets(op.get_bind())


def downgrade() -> None:
    # Deliberately a no-op: masking cannot be undone, and the cleartext secrets
    # must never come back.
    pass
