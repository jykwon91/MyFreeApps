"""add_financial_tables

Revision ID: a3f7c8d92e14
Revises: 96a9ce40d1b1
Create Date: 2026-03-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = "a3f7c8d92e14"
down_revision: Union[str, None] = "96a9ce40d1b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── extractions ──────────────────────────────────────────────────
    op.create_table(
        "extractions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="processing"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("raw_response", JSONB, nullable=True),
        sa.Column("confidence", sa.String(20), nullable=True),
        sa.Column("document_type", sa.String(50), nullable=False, server_default="invoice"),
        sa.Column("model_version", sa.String(100), nullable=True),
        sa.Column("tokens_used", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("status IN ('processing', 'completed', 'failed')", name="chk_ext_status"),
        sa.CheckConstraint("confidence IN ('high', 'medium', 'low')", name="chk_ext_confidence"),
        sa.CheckConstraint(
            "document_type IN ("
            "'invoice', 'statement', 'lease', 'insurance_policy', "
            "'tax_form', 'contract', 'year_end_statement', 'receipt', '1099', 'other'"
            ")",
            name="chk_ext_doc_type",
        ),
    )
    op.create_index("ix_ext_document", "extractions", [sa.text("document_id"), sa.text("created_at DESC")])
    op.create_index("ix_ext_org_status", "extractions", ["organization_id", "status"])

    # ── transactions ─────────────────────────────────────────────────
    op.create_table(
        "transactions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("property_id", UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True),
        sa.Column("extraction_id", UUID(as_uuid=True), sa.ForeignKey("extractions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("transaction_date", sa.Date, nullable=False),
        sa.Column("tax_year", sa.SmallInteger, nullable=False),
        sa.Column("vendor", sa.String(255), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("transaction_type", sa.String(10), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("tags", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("tax_relevant", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("schedule_e_line", sa.String(50), nullable=True),
        sa.Column("is_capital_improvement", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("placed_in_service_date", sa.Date, nullable=True),
        sa.Column("channel", sa.String(100), nullable=True),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("review_fields", JSONB, nullable=True),
        sa.Column("reconciled", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("reconciled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_manual", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("amount > 0", name="chk_txn_amount_positive"),
        sa.CheckConstraint("transaction_type IN ('income', 'expense')", name="chk_txn_type"),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'needs_review', 'duplicate')",
            name="chk_txn_status",
        ),
        sa.CheckConstraint(
            "category IN ("
            "'rental_revenue', 'cleaning_fee_revenue', "
            "'maintenance', 'contract_work', 'cleaning_expense', 'utilities', "
            "'management_fee', 'insurance', 'mortgage_interest', 'mortgage_principal', "
            "'taxes', 'channel_fee', 'advertising', 'legal_professional', 'travel', "
            "'other_expense', 'uncategorized'"
            ")",
            name="chk_txn_category",
        ),
        sa.CheckConstraint(
            "channel IS NULL OR channel IN ('airbnb', 'vrbo', 'booking.com', 'direct')",
            name="chk_txn_channel",
        ),
        sa.CheckConstraint(
            "payment_method IS NULL OR payment_method IN ("
            "'check', 'credit_card', 'bank_transfer', 'cash', 'platform_payout', 'other'"
            ")",
            name="chk_txn_payment",
        ),
        sa.CheckConstraint(
            "schedule_e_line IS NULL OR schedule_e_line IN ("
            "'line_3_rents_received', 'line_4_royalties', "
            "'line_5_advertising', 'line_6_auto_travel', 'line_7_cleaning_maintenance', "
            "'line_8_commissions', 'line_9_insurance', 'line_10_legal_professional', "
            "'line_12_mortgage_interest', 'line_13_other_interest', 'line_14_repairs', "
            "'line_16_taxes', 'line_17_utilities', 'line_18_depreciation', 'line_19_other'"
            ")",
            name="chk_txn_schedule_e",
        ),
        sa.CheckConstraint("tax_year >= 2020 AND tax_year <= 2099", name="chk_txn_tax_year"),
        sa.CheckConstraint(
            "NOT is_capital_improvement OR placed_in_service_date IS NOT NULL",
            name="chk_txn_capital",
        ),
        sa.CheckConstraint(
            "(transaction_type = 'income' AND category IN ("
            "'rental_revenue', 'cleaning_fee_revenue', 'uncategorized'"
            ")) OR "
            "(transaction_type = 'expense' AND category NOT IN ("
            "'rental_revenue', 'cleaning_fee_revenue'"
            "))",
            name="chk_txn_type_category",
        ),
    )
    op.create_index(
        "ix_txn_org_date", "transactions",
        ["organization_id", "transaction_date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_txn_org_property_date", "transactions",
        ["organization_id", "property_id", "transaction_date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_txn_org_type_date", "transactions",
        ["organization_id", "transaction_type", "transaction_date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_txn_org_category_date", "transactions",
        ["organization_id", "category", "transaction_date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_txn_org_status", "transactions",
        ["organization_id", "status"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index("ix_txn_extraction", "transactions", ["extraction_id"])
    op.create_index(
        "ix_txn_org_tax_year", "transactions",
        ["organization_id", "tax_year"],
        postgresql_where=sa.text("deleted_at IS NULL AND status = 'approved'"),
    )
    op.create_index(
        "ix_txn_org_reconciled", "transactions",
        ["organization_id", "reconciled"],
        postgresql_where=sa.text("deleted_at IS NULL AND reconciled = false"),
    )
    op.create_index(
        "ix_txn_summary", "transactions",
        ["organization_id", "transaction_date", "transaction_type", "category"],
        postgresql_where=sa.text("deleted_at IS NULL AND status = 'approved'"),
    )

    # ── reservations ─────────────────────────────────────────────────
    op.create_table(
        "reservations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_id", UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True),
        sa.Column("transaction_id", UUID(as_uuid=True), sa.ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("res_code", sa.String(100), nullable=False),
        sa.Column("platform", sa.String(100), nullable=True),
        sa.Column("check_in", sa.Date, nullable=False),
        sa.Column("check_out", sa.Date, nullable=False),
        sa.Column("nights", sa.Integer, sa.Computed("check_out - check_in")),
        sa.Column("gross_booking", sa.Numeric(12, 2), nullable=True),
        sa.Column("net_booking_revenue", sa.Numeric(12, 2), nullable=True),
        sa.Column("commission", sa.Numeric(12, 2), nullable=True),
        sa.Column("cleaning_fee", sa.Numeric(12, 2), nullable=True),
        sa.Column("insurance_fee", sa.Numeric(12, 2), nullable=True),
        sa.Column("net_client_earnings", sa.Numeric(12, 2), nullable=True),
        sa.Column("funds_due_to_client", sa.Numeric(12, 2), nullable=True),
        sa.Column("guest_name", sa.String(255), nullable=True),
        sa.Column("statement_period_start", sa.Date, nullable=True),
        sa.Column("statement_period_end", sa.Date, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("check_out > check_in", name="chk_res_dates"),
        sa.CheckConstraint(
            "platform IS NULL OR platform IN ('airbnb', 'vrbo', 'booking.com', 'direct')",
            name="chk_res_platform",
        ),
        sa.CheckConstraint(
            "platform IS NULL OR gross_booking IS NOT NULL",
            name="chk_res_gross_when_platform",
        ),
        sa.UniqueConstraint("organization_id", "res_code", name="uq_res_org_code"),
    )
    op.create_index("ix_res_property_dates", "reservations", ["organization_id", "property_id", "check_in"])
    op.create_index("ix_res_org_checkin", "reservations", ["organization_id", "check_in"])
    op.create_index("ix_res_platform", "reservations", ["organization_id", "platform"])
    op.create_index("ix_res_transaction", "reservations", ["transaction_id"])

    # ── reconciliation_sources ───────────────────────────────────────
    op.create_table(
        "reconciliation_sources",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("tax_year", sa.SmallInteger, nullable=False),
        sa.Column("issuer", sa.String(255), nullable=True),
        sa.Column("reported_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("matched_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("discrepancy", sa.Numeric(12, 2), sa.Computed("reported_amount - matched_amount")),
        sa.Column("status", sa.String(20), nullable=False, server_default="unmatched"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "source_type IN ('1099_misc', '1099_nec', '1099_k', 'year_end_statement')",
            name="chk_recon_type",
        ),
        sa.CheckConstraint("tax_year >= 2020 AND tax_year <= 2099", name="chk_recon_year"),
        sa.CheckConstraint(
            "status IN ('unmatched', 'partial', 'matched', 'confirmed')",
            name="chk_recon_status",
        ),
    )
    op.create_index("ix_recon_org_year", "reconciliation_sources", ["organization_id", "tax_year"])

    # ── reconciliation_matches ───────────────────────────────────────
    op.create_table(
        "reconciliation_matches",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("reconciliation_source_id", UUID(as_uuid=True), sa.ForeignKey("reconciliation_sources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reservation_id", UUID(as_uuid=True), sa.ForeignKey("reservations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("matched_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("reconciliation_source_id", "reservation_id", name="uq_recon_match"),
        sa.CheckConstraint("matched_amount > 0", name="chk_match_amount"),
    )
    op.create_index("ix_recon_match_source", "reconciliation_matches", ["reconciliation_source_id"])
    op.create_index("ix_recon_match_reservation", "reconciliation_matches", ["reservation_id"])

    # ── properties: add depreciation columns ─────────────────────────
    op.add_column("properties", sa.Column("purchase_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("properties", sa.Column("land_value", sa.Numeric(12, 2), nullable=True))
    op.add_column("properties", sa.Column("date_placed_in_service", sa.Date, nullable=True))
    op.add_column("properties", sa.Column("property_class", sa.String(20), nullable=True))
    op.add_column("properties", sa.Column("personal_use_days", sa.Integer, nullable=False, server_default="0"))
    op.create_check_constraint(
        "chk_prop_class", "properties",
        "property_class IS NULL OR property_class IN ('residential_27_5', 'commercial_39')",
    )
    op.create_check_constraint(
        "chk_prop_land", "properties",
        "land_value IS NULL OR (purchase_price IS NOT NULL AND land_value <= purchase_price)",
    )


def downgrade() -> None:
    # ── properties: remove depreciation columns ──────────────────────
    op.drop_constraint("chk_prop_land", "properties", type_="check")
    op.drop_constraint("chk_prop_class", "properties", type_="check")
    op.drop_column("properties", "personal_use_days")
    op.drop_column("properties", "property_class")
    op.drop_column("properties", "date_placed_in_service")
    op.drop_column("properties", "land_value")
    op.drop_column("properties", "purchase_price")

    # ── reconciliation_matches ───────────────────────────────────────
    op.drop_table("reconciliation_matches")

    # ── reconciliation_sources ───────────────────────────────────────
    op.drop_table("reconciliation_sources")

    # ── reservations ─────────────────────────────────────────────────
    op.drop_table("reservations")

    # ── transactions ─────────────────────────────────────────────────
    op.drop_table("transactions")

    # ── extractions ──────────────────────────────────────────────────
    op.drop_table("extractions")
