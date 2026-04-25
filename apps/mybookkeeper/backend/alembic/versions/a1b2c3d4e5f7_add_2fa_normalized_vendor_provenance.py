"""add 2fa, normalized_vendor, provenance, immutable audit

Revision ID: a1b2c3d4e5f7
Revises: 8f9c553fd358
Create Date: 2026-03-22 18:00:00.000000

"""
from typing import Sequence, Union

import re

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# Inlined from app.core.vendors to keep migration self-contained
_SUFFIXES = frozenset({
    "llc", "inc", "incorporated", "co", "corp", "corporation",
    "ltd", "limited", "plc", "lp", "llp", "pllc",
})
_SUFFIX_PATTERN = re.compile(
    r",?\s+(?:" + "|".join(re.escape(s) for s in _SUFFIXES) + r")\.?\s*$",
    re.IGNORECASE,
)
_WHITESPACE = re.compile(r"\s+")


def _normalize_vendor(name: str | None) -> str:
    if not name:
        return ""
    result = name.strip().lower()
    result = _SUFFIX_PATTERN.sub("", result)
    result = _WHITESPACE.sub(" ", result).strip()
    return result


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = '8f9c553fd358'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Transaction: normalized_vendor ---
    op.add_column('transactions', sa.Column('normalized_vendor', sa.String(255), nullable=True))
    op.create_index('ix_txn_normalized_vendor', 'transactions', ['normalized_vendor'])

    # Backfill normalized_vendor from vendor
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, vendor FROM transactions WHERE vendor IS NOT NULL"))
    for row in rows:
        nv = _normalize_vendor(row.vendor)
        if nv:
            conn.execute(
                sa.text("UPDATE transactions SET normalized_vendor = :nv WHERE id = :id"),
                {"nv": nv, "id": row.id},
            )

    # --- TaxFormField: overridden_by + overridden_at ---
    op.add_column('tax_form_fields', sa.Column(
        'overridden_by', UUID(as_uuid=True),
        sa.ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True,
    ))
    op.add_column('tax_form_fields', sa.Column(
        'overridden_at', sa.DateTime(timezone=True), nullable=True,
    ))

    # --- User: 2FA columns ---
    op.add_column('users', sa.Column('totp_secret', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('totp_enabled', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('totp_recovery_codes', sa.Text(), nullable=True))

    # --- Immutable audit trail: prevent UPDATE/DELETE on audit_logs ---
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'audit_logs table is append-only: % operations are not allowed', TG_OP;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_audit_log_immutable
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW
        EXECUTE FUNCTION prevent_audit_log_mutation();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_logs")
    op.execute("DROP FUNCTION IF EXISTS prevent_audit_log_mutation()")

    op.drop_column('users', 'totp_recovery_codes')
    op.drop_column('users', 'totp_enabled')
    op.drop_column('users', 'totp_secret')

    op.drop_column('tax_form_fields', 'overridden_at')
    op.drop_column('tax_form_fields', 'overridden_by')

    op.drop_index('ix_txn_normalized_vendor', table_name='transactions')
    op.drop_column('transactions', 'normalized_vendor')
