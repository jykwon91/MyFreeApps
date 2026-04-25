"""add is_demo and demo_tag to organizations

Revision ID: u5v6w7x8y9z0
Revises: t4u5v6w7x8y9
Create Date: 2026-03-31
"""
from alembic import op
import sqlalchemy as sa

revision = 'u5v6w7x8y9z0'
down_revision = 't4u5v6w7x8y9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'organizations' AND column_name = 'is_demo'"
    ))
    if not result.fetchone():
        op.add_column(
            'organizations',
            sa.Column('is_demo', sa.Boolean(), nullable=False, server_default='false'),
        )
        op.add_column(
            'organizations',
            sa.Column('demo_tag', sa.String(255), nullable=True),
        )

        # Backfill: mark existing demo orgs (owner email starts with 'demo')
        op.execute("""
            UPDATE organizations
            SET is_demo = true, demo_tag = 'legacy'
            WHERE created_by IN (
                SELECT id FROM users WHERE email LIKE 'demo%@mybookkeeper.com'
            )
        """)


def downgrade() -> None:
    op.drop_column('organizations', 'demo_tag')
    op.drop_column('organizations', 'is_demo')
