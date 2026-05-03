"""Add lease-template tables: templates, files, placeholders, signed_leases, signed_lease_attachments.

Phase 1 of the lease-templates feature. The host uploads reusable templates
with bracketed placeholders, generates filled-in leases per applicant, and
stores signed PDFs as attachments on dedicated signed-lease records.

Naming note: this PR uses ``signed_leases`` (and ``signed_lease_attachments``)
because the table name ``leases`` is already in use by an unrelated
financial-record concept under ``app/models/properties/lease.py``. See PR
description for the full naming rationale.

Revision ID: lease260502
Revises: mbk260502
Create Date: 2026-05-02 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.core.lease_enums import (
    LEASE_ATTACHMENT_KINDS_SQL,
    LEASE_PLACEHOLDER_INPUT_TYPES_SQL,
    SIGNED_LEASE_STATUSES_SQL,
)

revision: str = "lease260502"
down_revision: Union[str, None] = "stage260502"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- lease_templates -----------------------------------------------
    op.create_table(
        "lease_templates",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_lease_templates_user_id", "lease_templates", ["user_id"],
    )
    op.create_index(
        "ix_lease_templates_organization_id",
        "lease_templates", ["organization_id"],
    )
    op.create_index(
        "ix_lease_templates_org_active",
        "lease_templates",
        ["organization_id", "created_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # ---- lease_template_files ------------------------------------------
    op.create_table(
        "lease_template_files",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lease_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("content_type", sa.String(120), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_lease_template_files_template_id",
        "lease_template_files", ["template_id"],
    )

    # ---- lease_template_placeholders -----------------------------------
    op.create_table(
        "lease_template_placeholders",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lease_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("display_label", sa.String(200), nullable=False),
        sa.Column("input_type", sa.String(20), nullable=False),
        sa.Column(
            "required", sa.Boolean(), nullable=False, server_default="true",
        ),
        sa.Column("default_source", sa.String(120), nullable=True),
        sa.Column("computed_expr", sa.Text(), nullable=True),
        sa.Column(
            "display_order", sa.Integer(), nullable=False, server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "template_id", "key",
            name="uq_lease_template_placeholders_template_id_key",
        ),
        sa.CheckConstraint(
            f"input_type IN {LEASE_PLACEHOLDER_INPUT_TYPES_SQL}",
            name="chk_lease_template_placeholder_input_type",
        ),
    )
    op.create_index(
        "ix_lease_template_placeholders_template_id",
        "lease_template_placeholders", ["template_id"],
    )

    # ---- signed_leases -------------------------------------------------
    op.create_table(
        "signed_leases",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lease_templates.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "applicant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("applicants.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "listing_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("listings.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "values",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "status", sa.String(20), nullable=False, server_default="draft",
        ),
        sa.Column("starts_on", sa.Date(), nullable=True),
        sa.Column("ends_on", sa.Date(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            f"status IN {SIGNED_LEASE_STATUSES_SQL}",
            name="chk_signed_lease_status",
        ),
    )
    op.create_index("ix_signed_leases_user_id", "signed_leases", ["user_id"])
    op.create_index(
        "ix_signed_leases_organization_id", "signed_leases", ["organization_id"],
    )
    op.create_index(
        "ix_signed_leases_applicant_id", "signed_leases", ["applicant_id"],
    )
    op.create_index(
        "ix_signed_leases_listing_id", "signed_leases", ["listing_id"],
    )
    op.create_index(
        "ix_signed_leases_org_created_active",
        "signed_leases",
        ["organization_id", "created_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_signed_leases_org_status_active",
        "signed_leases",
        ["organization_id", "status"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # ---- signed_lease_attachments --------------------------------------
    op.create_table(
        "signed_lease_attachments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "lease_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("signed_leases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(120), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column(
            "uploaded_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            f"kind IN {LEASE_ATTACHMENT_KINDS_SQL}",
            name="chk_signed_lease_attachment_kind",
        ),
    )
    op.create_index(
        "ix_signed_lease_attachments_lease_id",
        "signed_lease_attachments", ["lease_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_signed_lease_attachments_lease_id",
        table_name="signed_lease_attachments",
    )
    op.drop_table("signed_lease_attachments")

    op.drop_index(
        "ix_signed_leases_org_status_active", table_name="signed_leases",
    )
    op.drop_index(
        "ix_signed_leases_org_created_active", table_name="signed_leases",
    )
    op.drop_index("ix_signed_leases_listing_id", table_name="signed_leases")
    op.drop_index("ix_signed_leases_applicant_id", table_name="signed_leases")
    op.drop_index(
        "ix_signed_leases_organization_id", table_name="signed_leases",
    )
    op.drop_index("ix_signed_leases_user_id", table_name="signed_leases")
    op.drop_table("signed_leases")

    op.drop_index(
        "ix_lease_template_placeholders_template_id",
        table_name="lease_template_placeholders",
    )
    op.drop_table("lease_template_placeholders")

    op.drop_index(
        "ix_lease_template_files_template_id",
        table_name="lease_template_files",
    )
    op.drop_table("lease_template_files")

    op.drop_index("ix_lease_templates_org_active", table_name="lease_templates")
    op.drop_index(
        "ix_lease_templates_organization_id", table_name="lease_templates",
    )
    op.drop_index("ix_lease_templates_user_id", table_name="lease_templates")
    op.drop_table("lease_templates")
