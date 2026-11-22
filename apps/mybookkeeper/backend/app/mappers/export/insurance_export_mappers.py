"""Account data export mappers: insurance and mortgages."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.insurance.insurance_benchmark import InsuranceBenchmark
from app.models.insurance.insurance_policy import InsurancePolicy
from app.models.insurance.insurance_policy_attachment import InsurancePolicyAttachment
from app.models.mortgage.mortgage import Mortgage

INSURANCE_POLICIES_EXPORT: Final = TableExportMapper(
    InsurancePolicy,
    (
        "id",
        "user_id",
        "organization_id",
        "property_id",
        "source_document_id",
        "policy_name",
        "carrier",
        "policy_number",
        "effective_date",
        "expiration_date",
        "coverage_amount_cents",
        "premium_cents",
        "premium_frequency",
        "fees_and_taxes_cents",
        "deductible_cents",
        "wind_hail_deductible_pct",
        "notes",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

INSURANCE_POLICY_ATTACHMENTS_EXPORT: Final = TableExportMapper(
    InsurancePolicyAttachment,
    (
        "id",
        "policy_id",
        "filename",
        "content_type",
        "size_bytes",
        "kind",
        "uploaded_by_user_id",
        "uploaded_at",
    ),
)

INSURANCE_BENCHMARKS_EXPORT: Final = TableExportMapper(
    InsuranceBenchmark,
    (
        "id",
        "recorded_by_user_id",
        "organization_id",
        "annual_premium_cents",
        "coverage_amount_cents",
        "region_label",
        "source",
        "observed_on",
        "notes",
        "created_at",
        "updated_at",
    ),
)

MORTGAGES_EXPORT: Final = TableExportMapper(
    Mortgage,
    (
        "id",
        "user_id",
        "organization_id",
        "property_id",
        "source_document_id",
        "lender",
        "account_number",
        "current_balance_cents",
        "statement_date",
        "original_principal_cents",
        "interest_rate",
        "rate_type",
        "fixed_until",
        "maturity_date",
        "term_months",
        "monthly_principal_cents",
        "monthly_interest_cents",
        "monthly_escrow_cents",
        "notes",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

INSURANCE_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    INSURANCE_POLICIES_EXPORT,
    INSURANCE_POLICY_ATTACHMENTS_EXPORT,
    INSURANCE_BENCHMARKS_EXPORT,
    MORTGAGES_EXPORT,
)
