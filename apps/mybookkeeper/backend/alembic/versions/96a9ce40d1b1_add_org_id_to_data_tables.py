"""add_org_id_to_data_tables

Revision ID: 96a9ce40d1b1
Revises: 8b303a77ac6d
Create Date: 2026-03-18 23:56:17.823443

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '96a9ce40d1b1'
down_revision: Union[str, None] = '8b303a77ac6d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# All data tables that need organization_id
_TABLES = [
    "documents",
    "properties",
    "integrations",
    "email_queue",
    "processed_emails",
    "sync_logs",
    "usage_logs",
    "tenants",
]


def upgrade() -> None:
    # Step 1: Add organization_id column (nullable) to all data tables
    for table in _TABLES:
        op.add_column(table, sa.Column('organization_id', sa.UUID(), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_organization_id",
            table, 'organizations',
            ['organization_id'], ['id'],
            ondelete='CASCADE',
        )

    # Step 2: Create personal organizations for existing users and backfill
    op.execute("""
        INSERT INTO organizations (id, name, created_by, created_at, updated_at)
        SELECT gen_random_uuid(), email || '''s Workspace', id, NOW(), NOW()
        FROM users
        WHERE id NOT IN (SELECT created_by FROM organizations)
    """)
    op.execute("""
        INSERT INTO organization_members (id, organization_id, user_id, org_role, joined_at)
        SELECT gen_random_uuid(), o.id, o.created_by, 'owner', NOW()
        FROM organizations o
        WHERE NOT EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.organization_id = o.id AND om.user_id = o.created_by
        )
    """)

    # Step 3: Backfill organization_id from user's personal org
    for table in _TABLES:
        op.execute(f"""
            UPDATE {table} t SET organization_id = (
                SELECT om.organization_id FROM organization_members om
                WHERE om.user_id = t.user_id AND om.org_role = 'owner'
                LIMIT 1
            )
            WHERE t.organization_id IS NULL
        """)

    # Step 4: Make organization_id NOT NULL
    for table in _TABLES:
        op.alter_column(table, 'organization_id', nullable=False)


def downgrade() -> None:
    for table in reversed(_TABLES):
        op.drop_constraint(f"fk_{table}_organization_id", table, type_='foreignkey')
        op.drop_column(table, 'organization_id')
