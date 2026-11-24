"""Account data export mappers: properties."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.properties.activity_period import ActivityPeriod
from app.models.properties.lease import Lease
from app.models.properties.market_rate_benchmark import MarketRateBenchmark
from app.models.properties.property import Property
from app.models.properties.tenant import Tenant
from app.models.properties.utility_account_link import UtilityAccountLink
from app.models.properties.utility_plan import UtilityPlan

PROPERTIES_EXPORT: Final = TableExportMapper(
    Property,
    (
        "id",
        "organization_id",
        "user_id",
        "name",
        "address",
        "classification",
        "type",
        "is_active",
        "external_id",
        "external_source",
        "purchase_price",
        "land_value",
        "date_placed_in_service",
        "rented_since",
        "property_class",
        "personal_use_days",
        "estimated_value_cents",
        "estimated_value_as_of",
        "created_at",
        "updated_at",
    ),
)

PROPERTY_ACTIVITY_PERIODS_EXPORT: Final = TableExportMapper(
    ActivityPeriod,
    (
        "id",
        "property_id",
        "active_from",
        "active_until",
    ),
)

TENANTS_EXPORT: Final = TableExportMapper(
    Tenant,
    (
        "id",
        "organization_id",
        "user_id",
        "property_id",
        "name",
        "email",
        "phone",
        "created_at",
    ),
)

LEASES_EXPORT: Final = TableExportMapper(
    Lease,
    (
        "id",
        "property_id",
        "tenant_id",
        "start_date",
        "end_date",
        "monthly_rent",
        "security_deposit",
        "status",
        "created_at",
    ),
)

UTILITY_ACCOUNT_LINK_EXPORT: Final = TableExportMapper(
    UtilityAccountLink,
    (
        "id",
        "organization_id",
        "user_id",
        "property_id",
        "sender_domain",
        "account_number",
        "provider_label",
        "source",
        "created_at",
        "updated_at",
    ),
)

UTILITY_PLANS_EXPORT: Final = TableExportMapper(
    UtilityPlan,
    (
        "id",
        "user_id",
        "organization_id",
        "property_id",
        "source_document_id",
        "service_type",
        "provider_name",
        "account_number",
        "plan_name",
        "rate_type",
        "energy_charge_cents_per_kwh",
        "tdu_charge_cents_per_kwh",
        "avg_price_cents_per_kwh_at_1000",
        "monthly_base_charge_cents",
        "term_months",
        "service_start_date",
        "term_end_date",
        "early_termination_fee_cents",
        "has_bill_credit",
        "bill_credit_amount_cents",
        "bill_credit_threshold_kwh",
        "min_usage_fee_cents",
        "min_usage_threshold_kwh",
        "post_promo_monthly_cents",
        "equipment_fee_monthly_cents",
        "download_mbps",
        "upload_mbps",
        "data_cap_gb",
        "notes",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

MARKET_RATE_BENCHMARKS_EXPORT: Final = TableExportMapper(
    MarketRateBenchmark,
    (
        "id",
        "recorded_by_user_id",
        "organization_id",
        "service_type",
        "rate_cents_per_kwh",
        "monthly_cents",
        "source",
        "observed_on",
        "notes",
        "created_at",
        "updated_at",
    ),
)

PROPERTY_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    PROPERTIES_EXPORT,
    PROPERTY_ACTIVITY_PERIODS_EXPORT,
    TENANTS_EXPORT,
    LEASES_EXPORT,
    UTILITY_ACCOUNT_LINK_EXPORT,
    UTILITY_PLANS_EXPORT,
    MARKET_RATE_BENCHMARKS_EXPORT,
)
