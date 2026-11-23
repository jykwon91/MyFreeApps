"""Mask bearer tokens the audit listener wrote to audit_logs in cleartext

Revision ID: audittokens261123
Revises: auditmask261122
Create Date: 2026-11-23 00:00:00.000000

The audit listener copied these columns' values into audit_logs because they
were not in app/core/audit.py's sensitive fields: an organization invite's
token, a welcome manual's guest share token, and a channel listing's public
iCal feed token and the secret-bearing feed URL and token it imports from.
Each lets whoever holds it in without signing in. This replaces those
old_value / new_value with the mask the listener writes for a sensitive column.
Only rows of those columns, in the table each belongs to, change, and only
their values: a NULL stays NULL, and a value account erasure already replaced
keeps its marker. Running it again changes nothing.

``trg_audit_log_immutable`` lets this UPDATE through: since
``auditmaskok261122`` it allows old_value / new_value to become the mask.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.engine import Connection

from alembic import op

revision: str = "audittokens261123"
down_revision: str | None = "auditmask261122"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen copies as of this revision, so the migration never changes meaning:
# the listener's mask (platform_shared.core.audit_erasure_constants
# .MASKED_AUDIT_VALUE) and erasure marker (.ERASED_AUDIT_VALUE). Columns are
# matched with their table: ``token`` is too generic a name to mask anywhere else.
_MASK = "***"
_ERASED = "[erased]"

_MASK_VALUES = sa.text(
    """
    UPDATE audit_logs
    SET old_value = CASE WHEN old_value IS NULL OR old_value IN (:mask, :erased) THEN old_value ELSE :mask END,
        new_value = CASE WHEN new_value IS NULL OR new_value IN (:mask, :erased) THEN new_value ELSE :mask END
    WHERE (
        (table_name = 'organization_invites' AND field_name = 'token')
        OR (table_name = 'welcome_manuals' AND field_name = 'share_token')
        OR (table_name = 'channel_listings' AND field_name IN (
            'ical_export_token', 'ical_import_secret_token', 'ical_import_url'
        ))
      )
      AND (
        (old_value IS NOT NULL AND old_value NOT IN (:mask, :erased))
        OR (new_value IS NOT NULL AND new_value NOT IN (:mask, :erased))
      )
    """
)


def mask_audit_log_bearer_tokens(connection: Connection) -> None:
    connection.execute(_MASK_VALUES, {"mask": _MASK, "erased": _ERASED})


def upgrade() -> None:
    mask_audit_log_bearer_tokens(op.get_bind())


def downgrade() -> None:
    # Deliberately a no-op: masked data can't be restored, and the cleartext
    # tokens must never come back.
    pass
