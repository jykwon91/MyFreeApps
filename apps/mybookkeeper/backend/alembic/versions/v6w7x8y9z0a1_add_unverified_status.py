"""add unverified to transaction status constraint

Revision ID: v6w7x8y9z0a1
Revises: u5v6w7x8y9z0
Create Date: 2026-04-02
"""
from alembic import op

revision = 'v6w7x8y9z0a1'
down_revision = 'u5v6w7x8y9z0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_txn_status"
    )
    op.execute(
        "ALTER TABLE transactions ADD CONSTRAINT chk_txn_status "
        "CHECK (status IN ('pending', 'approved', 'needs_review', 'duplicate', 'unverified'))"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE transactions DROP CONSTRAINT IF EXISTS chk_txn_status"
    )
    op.execute(
        "ALTER TABLE transactions ADD CONSTRAINT chk_txn_status "
        "CHECK (status IN ('pending', 'approved', 'needs_review', 'duplicate'))"
    )
