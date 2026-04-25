"""schema cleanup: FK cascades, indexes, filing_status dedup, org_id NOT NULL

Revision ID: a2b3c4d5e6f7
Revises: 170e84f3bc64
Create Date: 2026-03-29 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = '170e84f3bc64'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Tables that need user_id FK changed to CASCADE
_USER_FK_TABLES = [
    ("extractions", "extractions_user_id_fkey"),
    ("vendor_rules", "vendor_rules_created_by_fkey"),
    ("classification_rules", "classification_rules_created_by_fkey"),
    ("plaid_items", "plaid_items_user_id_fkey"),
    ("reconciliation_sources", "reconciliation_sources_user_id_fkey"),
    ("transactions", "transactions_user_id_fkey"),
]

# FK column name for each table (most are user_id, vendor_rules/classification_rules use created_by)
_FK_COLUMNS = {
    "extractions": "user_id",
    "vendor_rules": "created_by",
    "classification_rules": "created_by",
    "plaid_items": "user_id",
    "reconciliation_sources": "user_id",
    "transactions": "user_id",
}

# Tables that need organization_id backfilled then set NOT NULL
_ORG_ID_TABLES = [
    "documents", "email_queue", "processed_emails",
    "integrations", "sync_logs", "properties", "tenants", "usage_logs",
]


def upgrade() -> None:
    # --- 1. Fix user_id FK ondelete to CASCADE ---
    for table, fk_name in _USER_FK_TABLES:
        col = _FK_COLUMNS[table]
        op.drop_constraint(fk_name, table, type_="foreignkey")
        op.create_foreign_key(
            fk_name, table, "users",
            [col], ["id"], ondelete="CASCADE",
        )

    # --- 2. Add AuditLog indexes ---
    op.create_index("ix_audit_table_record", "audit_logs", ["table_name", "record_id"])
    op.create_index("ix_audit_changed_at", "audit_logs", [sa.text("changed_at DESC")])

    # --- 3. Remove redundant indexes ---
    op.drop_index("ix_tff_instance", table_name="tax_form_fields")
    op.drop_index("ix_recon_match_source", table_name="reconciliation_matches")

    # --- 4. Add dedup lookup composite index on transactions ---
    op.create_index(
        "ix_txn_dedup_lookup", "transactions",
        ["organization_id", "amount", "transaction_type"],
        postgresql_where=sa.text("deleted_at IS NULL AND status != 'duplicate'"),
    )

    # --- 5. filing_status dedup: copy to tax_year_profiles, drop from tax_profiles ---
    op.execute(sa.text("""
        UPDATE tax_year_profiles typ
        SET filing_status = tp.filing_status
        FROM tax_profiles tp
        WHERE typ.organization_id = tp.organization_id
          AND typ.filing_status IS NULL
          AND tp.filing_status IS NOT NULL
    """))
    op.drop_column("tax_profiles", "filing_status")

    # --- 6. Backfill NULL organization_id from user's org membership ---
    for table in _ORG_ID_TABLES:
        op.execute(sa.text(f"""
            UPDATE {table} t
            SET organization_id = om.organization_id
            FROM organization_members om
            WHERE t.user_id = om.user_id
              AND t.organization_id IS NULL
        """))

    # Delete orphaned rows with no org (user not in any org).
    # Safe: table names are compile-time constants, not user input.
    # Verified: all users have org memberships; zero rows deleted in production.
    for table in _ORG_ID_TABLES:
        op.execute(sa.text(f"""
            DELETE FROM {table} WHERE organization_id IS NULL
        """))

    # Alter columns to NOT NULL
    for table in _ORG_ID_TABLES:
        op.alter_column(table, "organization_id", nullable=False)


def downgrade() -> None:
    # Reverse org_id NOT NULL
    for table in _ORG_ID_TABLES:
        op.alter_column(table, "organization_id", nullable=True)

    # Restore filing_status on tax_profiles
    op.add_column("tax_profiles", sa.Column("filing_status", sa.String(30), nullable=True))

    # Drop dedup index
    op.drop_index("ix_txn_dedup_lookup", table_name="transactions")

    # Restore redundant indexes
    op.create_index("ix_recon_match_source", "reconciliation_matches", ["reconciliation_source_id"])
    op.create_index("ix_tff_instance", "tax_form_fields", ["form_instance_id"])

    # Drop audit indexes
    op.drop_index("ix_audit_changed_at", table_name="audit_logs")
    op.drop_index("ix_audit_table_record", table_name="audit_logs")

    # Reverse user_id FK cascades
    for table, fk_name in _USER_FK_TABLES:
        col = _FK_COLUMNS[table]
        op.drop_constraint(fk_name, table, type_="foreignkey")
        op.create_foreign_key(
            fk_name, table, "users",
            [col], ["id"],
        )
