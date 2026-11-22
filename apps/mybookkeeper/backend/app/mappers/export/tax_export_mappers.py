"""Account data export mappers: tax."""
from typing import Final

from app.mappers.export.column_transforms import (
    TAX_FORM_FIELD_VALUE_MASKED,
    TAX_FORM_INSTANCE_ISSUER_EIN_MASKED,
)
from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.tax.cost_basis_lot import CostBasisLot
from app.models.tax.estimated_tax_payment import EstimatedTaxPayment
from app.models.tax.tax_advisor_generation import TaxAdvisorGeneration
from app.models.tax.tax_advisor_suggestion import TaxAdvisorSuggestion
from app.models.tax.tax_carryforward import TaxCarryforward
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_field_source import TaxFormFieldSource
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.tax.tax_year_profile import TaxYearProfile

TAX_RETURNS_EXPORT: Final = TableExportMapper(
    TaxReturn,
    (
        "id",
        "organization_id",
        "tax_year",
        "filing_status",
        "jurisdiction",
        "status",
        "needs_recompute",
        "filed_at",
        "created_at",
        "updated_at",
    ),
)

TAX_YEAR_PROFILES_EXPORT: Final = TableExportMapper(
    TaxYearProfile,
    (
        "id",
        "organization_id",
        "tax_year",
        "filing_status",
        "dependents_count",
        "property_use_days",
        "home_office_sqft",
        "home_total_sqft",
        "business_mileage",
        "created_at",
        "updated_at",
    ),
)

TAX_FORM_INSTANCES_EXPORT: Final = TableExportMapper(
    TaxFormInstance,
    (
        "id",
        "tax_return_id",
        "form_name",
        "instance_label",
        "source_type",
        "document_id",
        "extraction_id",
        "property_id",
        "activity_id",
        "issuer_name",
        "status",
        "created_at",
        "updated_at",
    ),
    transformed_columns={"issuer_ein": TAX_FORM_INSTANCE_ISSUER_EIN_MASKED},
)

TAX_FORM_FIELDS_EXPORT: Final = TableExportMapper(
    TaxFormField,
    (
        "id",
        "form_instance_id",
        "field_id",
        "field_label",
        "value_numeric",
        "value_boolean",
        "is_calculated",
        "is_overridden",
        "overridden_by",
        "overridden_at",
        "override_reason",
        "validation_status",
        "validation_message",
        "confidence",
        "created_at",
        "updated_at",
    ),
    transformed_columns={"value_text": TAX_FORM_FIELD_VALUE_MASKED},
)

TAX_FORM_FIELD_SOURCES_EXPORT: Final = TableExportMapper(
    TaxFormFieldSource,
    (
        "id",
        "field_id",
        "source_type",
        "source_id",
        "amount",
        "description",
        "created_at",
    ),
)

TAX_CARRYFORWARDS_EXPORT: Final = TableExportMapper(
    TaxCarryforward,
    (
        "id",
        "organization_id",
        "tax_return_id",
        "carryforward_type",
        "from_year",
        "to_year",
        "amount",
        "amount_used",
        "remaining",
        "created_at",
        "updated_at",
    ),
)

TAX_ADVISOR_GENERATIONS_EXPORT: Final = TableExportMapper(
    TaxAdvisorGeneration,
    (
        "id",
        "tax_return_id",
        "organization_id",
        "requested_by",
        "model_version",
        "suggestion_count",
        "created_at",
    ),
)

TAX_ADVISOR_SUGGESTIONS_EXPORT: Final = TableExportMapper(
    TaxAdvisorSuggestion,
    (
        "id",
        "tax_return_id",
        "organization_id",
        "generation_id",
        "suggestion_key",
        "category",
        "severity",
        "title",
        "description",
        "estimated_savings",
        "action",
        "irs_reference",
        "confidence",
        "affected_properties",
        "affected_form",
        "status",
        "status_changed_at",
        "status_changed_by",
        "created_at",
    ),
)

COST_BASIS_LOTS_EXPORT: Final = TableExportMapper(
    CostBasisLot,
    (
        "id",
        "organization_id",
        "user_id",
        "extraction_id",
        "asset_name",
        "asset_type",
        "ticker",
        "shares",
        "cost_basis",
        "acquisition_date",
        "sale_date",
        "proceeds",
        "gain_loss",
        "tax_year",
        "holding_period",
        "created_at",
        "updated_at",
    ),
)

ESTIMATED_TAX_PAYMENTS_EXPORT: Final = TableExportMapper(
    EstimatedTaxPayment,
    (
        "id",
        "organization_id",
        "user_id",
        "transaction_id",
        "tax_year",
        "quarter",
        "amount",
        "payment_date",
        "jurisdiction",
        "payment_method",
        "confirmation_number",
        "created_at",
        "updated_at",
    ),
)

TAX_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    TAX_RETURNS_EXPORT,
    TAX_YEAR_PROFILES_EXPORT,
    TAX_FORM_INSTANCES_EXPORT,
    TAX_FORM_FIELDS_EXPORT,
    TAX_FORM_FIELD_SOURCES_EXPORT,
    TAX_CARRYFORWARDS_EXPORT,
    TAX_ADVISOR_GENERATIONS_EXPORT,
    TAX_ADVISOR_SUGGESTIONS_EXPORT,
    COST_BASIS_LOTS_EXPORT,
    ESTIMATED_TAX_PAYMENTS_EXPORT,
)
