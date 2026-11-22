"""Redact tutor transcript text already copied into audit_logs

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-22 00:00:00.000000

Until the tutor_turn transcript columns were added to the audit listener's
sensitive fields, every turn insert and update copied the decrypted learner and
tutor text into audit_logs. This replaces those old_value / new_value entries
with the mask the listener now writes. The audit rows themselves are kept; a
NULL stays NULL, as the listener writes for an update to or from NULL.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine import Connection

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies, so this migration never changes meaning: the listener's mask
# (platform_shared.core.audit_constants.SENSITIVE_VALUE_MASK) and the
# tutor_turn transcript columns as of this revision.
_MASK = "***"
_TABLE = "tutor_turn"
_FIELDS = ("learner_text", "reply_text", "corrections_json", "translation_text")

_REDACT = sa.text(
    """
    UPDATE audit_logs
    SET old_value = CASE WHEN old_value IS NULL THEN NULL ELSE :mask END,
        new_value = CASE WHEN new_value IS NULL THEN NULL ELSE :mask END
    WHERE table_name = :table
      AND field_name IN :fields
      AND (
        (old_value IS NOT NULL AND old_value <> :mask)
        OR (new_value IS NOT NULL AND new_value <> :mask)
      )
    """
).bindparams(sa.bindparam("fields", expanding=True))


def redact_tutor_turn_audit_values(connection: Connection) -> None:
    connection.execute(_REDACT, {"mask": _MASK, "table": _TABLE, "fields": list(_FIELDS)})


def upgrade() -> None:
    redact_tutor_turn_audit_values(op.get_bind())


def downgrade() -> None:
    # Deliberately a no-op: the redacted text is gone and must not come back.
    pass
