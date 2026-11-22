"""Let account deletion redact audit_logs values, and nothing else.

``trg_audit_log_immutable`` refused every UPDATE and DELETE on
``audit_logs``. Deleting an account now overwrites the values of the deleted
user's audit rows with ``[erased]``
(``platform_shared.core.audit_erasure_constants.ERASED_AUDIT_VALUE``), so the
trigger function lets exactly that through:

- DELETE is still refused.
- An UPDATE is allowed only if every column other than ``old_value`` and
  ``new_value`` is unchanged, and each of those two is unchanged, NULL, or
  ``[erased]``. Anything else is refused as before.

The marker is spelled out here, not imported, so this migration keeps meaning
what it meant when it ran.

Revision ID: auditredact261122
Revises: emailqueueretry261121
"""
from collections.abc import Sequence

from alembic import op

revision: str = "auditredact261122"
down_revision: str | None = "emailqueueretry261121"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REDACTION_ONLY = """
    CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
        IF TG_OP = 'UPDATE'
            AND (to_jsonb(NEW) - 'old_value' - 'new_value')
                = (to_jsonb(OLD) - 'old_value' - 'new_value')
            AND (NEW.old_value IS NOT DISTINCT FROM OLD.old_value
                 OR NEW.old_value IS NULL OR NEW.old_value = '[erased]')
            AND (NEW.new_value IS NOT DISTINCT FROM OLD.new_value
                 OR NEW.new_value IS NULL OR NEW.new_value = '[erased]')
        THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'audit_logs table is append-only: % operations are not allowed', TG_OP;
    END;
    $$ LANGUAGE plpgsql;
"""

_APPEND_ONLY = """
    CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
        RAISE EXCEPTION 'audit_logs table is append-only: % operations are not allowed', TG_OP;
    END;
    $$ LANGUAGE plpgsql;
"""


def upgrade() -> None:
    op.execute(_REDACTION_ONLY)


def downgrade() -> None:
    op.execute(_APPEND_ONLY)
