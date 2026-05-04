"""Add insurance_policies and insurance_policy_attachments tables.

Phase 1: storage + CRUD only. AI extraction of policy details is Phase 2.

Tables:
  insurance_policies — one policy per listing (with optional PII-adjacent
    policy_number encrypted via EncryptedString/Fernet).
  insurance_policy_attachments — files attached to a policy (policy docs,
    endorsements, binders, other).

Storage key partition: insurance-policies/{policy_id}/{attachment_id}.

Revision ID: insur260504
Revises: calttp260503
Create Date: 2026-05-04 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision: str = "insur260504"
down_revision: Union[str, None] = "calttp260503"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # insurance_policies
    # ------------------------------------------------------------------
    op.create_table(
        "insurance_policies",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "listing_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("listings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("policy_name", sa.String(255), nullable=False),
        sa.Column("carrier", sa.String(255), nullable=True),
        # Encrypted at rest via EncryptedString / Fernet.
        sa.Column("policy_number", sa.Text(), nullable=True),
        sa.Column("key_version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("effective_date", sa.Date(), nullable=True),
        sa.Column("expiration_date", sa.Date(), nullable=True),
        sa.Column("coverage_amount_cents", sa.BigInteger(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "length(policy_name) > 0",
            name="chk_insurance_policy_name_nonempty",
        ),
    )

    # Indexes on insurance_policies.
    op.create_index("ix_insurance_policies_user_id", "insurance_policies", ["user_id"])
    op.create_index(
        "ix_insurance_policies_organization_id",
        "insurance_policies",
        ["organization_id"],
    )
    op.create_index(
        "ix_insurance_policies_listing_id",
        "insurance_policies",
        ["listing_id"],
    )
    op.create_index(
        "ix_insurance_policies_org_created_active",
        "insurance_policies",
        ["organization_id", "created_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_insurance_policies_org_expiration_active",
        "insurance_policies",
        ["organization_id", "expiration_date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # ------------------------------------------------------------------
    # insurance_policy_attachments
    # ------------------------------------------------------------------
    op.create_table(
        "insurance_policy_attachments",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "policy_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("insurance_policies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(120), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column(
            "uploaded_by_user_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "kind IN ('policy_document', 'endorsement', 'binder', 'other')",
            name="chk_insurance_policy_attachment_kind",
        ),
    )

    op.create_index(
        "ix_insurance_policy_attachments_policy_id",
        "insurance_policy_attachments",
        ["policy_id"],
    )


def downgrade() -> None:
    op.drop_table("insurance_policy_attachments")

    op.drop_index(
        "ix_insurance_policies_org_expiration_active",
        table_name="insurance_policies",
    )
    op.drop_index(
        "ix_insurance_policies_org_created_active",
        table_name="insurance_policies",
    )
    op.drop_index("ix_insurance_policies_listing_id", table_name="insurance_policies")
    op.drop_index(
        "ix_insurance_policies_organization_id",
        table_name="insurance_policies",
    )
    op.drop_index("ix_insurance_policies_user_id", table_name="insurance_policies")

    op.drop_table("insurance_policies")
