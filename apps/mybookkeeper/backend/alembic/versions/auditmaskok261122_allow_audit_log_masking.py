"""Let audit_logs values also be overwritten with the listener's mask.

``trg_audit_log_immutable`` (last changed in ``auditredact261122``) lets an
UPDATE through only if it changes nothing but ``old_value`` / ``new_value``,
and each of those is unchanged, NULL, or ``[erased]``. The next migration
(``auditmask261122``) replaces secrets the listener wrote in cleartext with
the mask it writes for a sensitive column, ``***``. Like ``[erased]``, the mask
only removes what a value said, so the trigger now allows it too. DELETE and
every other UPDATE are still refused.

The markers are spelled out here, not imported, so this migration keeps
meaning what it meant when it ran.

Revision ID: auditmaskok261122
Revises: auditredact261122
"""
from collections.abc import Sequence

from alembic import op

revision: str = "auditmaskok261122"
down_revision: str | None = "auditredact261122"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REDACTION_OR_MASK = """
    CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
        IF TG_OP = 'UPDATE'
            AND (to_jsonb(NEW) - 'old_value' - 'new_value')
                = (to_jsonb(OLD) - 'old_value' - 'new_value')
            AND (NEW.old_value IS NOT DISTINCT FROM OLD.old_value
                 OR NEW.old_value IS NULL OR NEW.old_value IN ('[erased]', '***'))
            AND (NEW.new_value IS NOT DISTINCT FROM OLD.new_value
                 OR NEW.new_value IS NULL OR NEW.new_value IN ('[erased]', '***'))
        THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'audit_logs table is append-only: % operations are not allowed', TG_OP;
    END;
    $$ LANGUAGE plpgsql;
"""

# The function as auditredact261122 left it.
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


def upgrade() -> None:
    op.execute(_REDACTION_OR_MASK)


def downgrade() -> None:
    op.execute(_REDACTION_ONLY)
