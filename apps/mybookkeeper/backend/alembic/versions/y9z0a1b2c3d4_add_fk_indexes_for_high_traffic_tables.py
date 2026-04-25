"""add FK indexes for high-traffic tables

Revision ID: y9z0a1b2c3d4
Revises: x8y9z0a1b2c3
Create Date: 2026-04-04

Audit 2026-04-03 flagged 9 FK columns on high-traffic tables without explicit
indexes. PostgreSQL does not auto-index FKs; cascade deletes and JOIN queries
perform full table scans without them.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "y9z0a1b2c3d4"
down_revision: Union[str, None] = "x8y9z0a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # organization_members.user_id — critical for login flow (find user's orgs)
    op.create_index("ix_org_members_user_id", "organization_members", ["user_id"])
    # properties.organization_id — org dashboard lists all properties
    op.create_index("ix_properties_organization_id", "properties", ["organization_id"])
    # documents.user_id — user-scoped document queries
    op.create_index("ix_documents_user_id", "documents", ["user_id"])
    # documents.property_id — property detail page shows linked documents
    op.create_index("ix_documents_property_id", "documents", ["property_id"])
    # transactions.user_id — user-scoped transaction queries
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"])
    # extractions.user_id — extraction usage tracking per user
    op.create_index("ix_extractions_user_id", "extractions", ["user_id"])
    # usage_logs.organization_id — admin cost monitoring per org
    op.create_index("ix_usage_logs_organization_id", "usage_logs", ["organization_id"])
    # usage_logs.user_id — user cost history
    op.create_index("ix_usage_logs_user_id", "usage_logs", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_usage_logs_user_id", "usage_logs")
    op.drop_index("ix_usage_logs_organization_id", "usage_logs")
    op.drop_index("ix_extractions_user_id", "extractions")
    op.drop_index("ix_transactions_user_id", "transactions")
    op.drop_index("ix_documents_property_id", "documents")
    op.drop_index("ix_documents_user_id", "documents")
    op.drop_index("ix_properties_organization_id", "properties")
    op.drop_index("ix_org_members_user_id", "organization_members")
