"""add_tax_form_tables

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-03-19 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # tax_returns
    op.create_table(
        "tax_returns",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tax_year", sa.SmallInteger(), nullable=False),
        sa.Column("filing_status", sa.String(20), nullable=False, server_default="single"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("needs_recompute", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("filed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("organization_id", "tax_year", name="uq_return_org_year"),
        sa.CheckConstraint("tax_year >= 2020 AND tax_year <= 2099", name="chk_return_year"),
        sa.CheckConstraint("status IN ('draft', 'ready', 'filed')", name="chk_return_status"),
        sa.CheckConstraint(
            "filing_status IN ('single', 'married_joint', 'married_separate', 'head_of_household', 'qualifying_widow')",
            name="chk_return_filing",
        ),
    )

    # tax_form_instances
    op.create_table(
        "tax_form_instances",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tax_return_id", UUID(as_uuid=True), sa.ForeignKey("tax_returns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("form_name", sa.String(50), nullable=False),
        sa.Column("instance_label", sa.String(255), nullable=True),
        sa.Column("source_type", sa.String(20), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("extraction_id", UUID(as_uuid=True), sa.ForeignKey("extractions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("property_id", UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True),
        sa.Column("issuer_ein", sa.String(20), nullable=True),
        sa.Column("issuer_name", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("source_type IN ('extracted', 'computed', 'manual')", name="chk_tfi_source"),
        sa.CheckConstraint("status IN ('draft', 'validated', 'flagged', 'locked')", name="chk_tfi_status"),
        sa.CheckConstraint(
            "form_name IN ("
            "'w2', '1099_int', '1099_div', '1099_b', '1099_k', "
            "'1099_misc', '1099_nec', '1099_r', '1098', 'k1', "
            "'1040', 'schedule_1', 'schedule_2', 'schedule_3', "
            "'schedule_a', 'schedule_b', 'schedule_c', 'schedule_d', "
            "'schedule_e', 'schedule_se', "
            "'form_8949', 'form_4562', 'form_4797', "
            "'form_8582', 'form_8960', 'form_8995'"
            ")",
            name="chk_tfi_form",
        ),
    )
    op.create_index("ix_tfi_return_form", "tax_form_instances", ["tax_return_id", "form_name"])
    op.execute(
        "CREATE INDEX ix_tfi_document ON tax_form_instances (document_id) WHERE document_id IS NOT NULL"
    )

    # tax_form_fields
    op.create_table(
        "tax_form_fields",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("form_instance_id", UUID(as_uuid=True), sa.ForeignKey("tax_form_instances.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_id", sa.String(100), nullable=False),
        sa.Column("field_label", sa.String(255), nullable=False),
        sa.Column("value_numeric", sa.Numeric(12, 2), nullable=True),
        sa.Column("value_text", sa.String(500), nullable=True),
        sa.Column("value_boolean", sa.Boolean(), nullable=True),
        sa.Column("is_calculated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_overridden", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("override_reason", sa.String(255), nullable=True),
        sa.Column("validation_status", sa.String(20), nullable=False, server_default="unvalidated"),
        sa.Column("validation_message", sa.Text(), nullable=True),
        sa.Column("confidence", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("form_instance_id", "field_id", name="uq_field_per_instance"),
        sa.CheckConstraint(
            "validation_status IN ('unvalidated', 'valid', 'warning', 'error')",
            name="chk_tff_validation",
        ),
        sa.CheckConstraint(
            "confidence IS NULL OR confidence IN ('high', 'medium', 'low')",
            name="chk_tff_confidence",
        ),
        sa.CheckConstraint(
            "value_numeric IS NOT NULL OR value_text IS NOT NULL OR value_boolean IS NOT NULL",
            name="chk_tff_has_value",
        ),
    )
    op.create_index("ix_tff_instance", "tax_form_fields", ["form_instance_id"])

    # tax_form_field_sources
    op.create_table(
        "tax_form_field_sources",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("field_id", UUID(as_uuid=True), sa.ForeignKey("tax_form_fields.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_id", UUID(as_uuid=True), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "source_type IN ('transaction', 'reservation', 'reconciliation_source', 'tax_form_instance', 'manual')",
            name="chk_tffs_source",
        ),
    )
    op.create_index("ix_tffs_field", "tax_form_field_sources", ["field_id"])
    op.create_index("ix_tffs_source", "tax_form_field_sources", ["source_type", "source_id"])

    # Expand extractions.document_type CHECK to include tax source form types
    op.drop_constraint("chk_ext_doc_type", "extractions", type_="check")
    op.create_check_constraint(
        "chk_ext_doc_type",
        "extractions",
        "document_type IN ("
        "'invoice', 'statement', 'lease', 'insurance_policy', "
        "'tax_form', 'contract', 'year_end_statement', 'receipt', '1099', 'other', "
        "'w2', '1099_int', '1099_div', '1099_b', '1099_k', "
        "'1099_misc', '1099_nec', '1099_r', '1098', 'k1'"
        ")",
    )


def downgrade() -> None:
    # Restore original extractions.document_type CHECK
    op.drop_constraint("chk_ext_doc_type", "extractions", type_="check")
    op.create_check_constraint(
        "chk_ext_doc_type",
        "extractions",
        "document_type IN ("
        "'invoice', 'statement', 'lease', 'insurance_policy', "
        "'tax_form', 'contract', 'year_end_statement', 'receipt', '1099', 'other'"
        ")",
    )

    op.drop_table("tax_form_field_sources")
    op.drop_table("tax_form_fields")
    op.drop_table("tax_form_instances")
    op.drop_table("tax_returns")
