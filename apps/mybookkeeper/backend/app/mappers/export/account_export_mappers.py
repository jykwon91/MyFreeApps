"""Account data export mappers: account, workspace and settings."""
from typing import Final

from app.mappers.export.column_transforms import INTEGRATION_GMAIL_LABEL, decrypted_as
from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.classification.classification_rule import ClassificationRule
from app.models.classification.classification_rule_split_property import ClassificationRuleSplitProperty
from app.models.extraction.extraction_prompt import ExtractionPrompt
from app.models.integrations.integration import Integration
from app.models.organization.activity import Activity
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.organization.tax_profile import TaxProfile
from app.models.organization.taxpayer_profile import TaxpayerProfile
from app.models.user.user import User

USERS_EXPORT: Final = TableExportMapper(
    User,
    (
        "id",
        "email",
        "name",
        "role",
        "is_active",
        "is_superuser",
        "is_verified",
        "totp_enabled",
    ),
)

ORGANIZATIONS_EXPORT: Final = TableExportMapper(
    Organization,
    (
        "id",
        "name",
        "created_by",
        "is_demo",
        "demo_tag",
        "created_at",
        "updated_at",
    ),
)

ORGANIZATION_MEMBERS_EXPORT: Final = TableExportMapper(
    OrganizationMember,
    (
        "id",
        "organization_id",
        "user_id",
        "org_role",
        "invited_by",
        "joined_at",
    ),
)

TAX_PROFILES_EXPORT: Final = TableExportMapper(
    TaxProfile,
    (
        "id",
        "organization_id",
        "tax_situations",
        "dependents_count",
        "onboarding_completed",
        "created_at",
        "updated_at",
    ),
)

TAXPAYER_PROFILES_EXPORT: Final = TableExportMapper(
    TaxpayerProfile,
    (
        "id",
        "organization_id",
        "filer_type",
        "ssn_last_four",
        "created_at",
        "updated_at",
    ),
    transformed_columns={
        "encrypted_first_name": decrypted_as("first_name"),
        "encrypted_last_name": decrypted_as("last_name"),
        "encrypted_middle_initial": decrypted_as("middle_initial"),
        "encrypted_date_of_birth": decrypted_as("date_of_birth"),
        "encrypted_street_address": decrypted_as("street_address"),
        "encrypted_apartment_unit": decrypted_as("apartment_unit"),
        "encrypted_city": decrypted_as("city"),
        "encrypted_state": decrypted_as("state"),
        "encrypted_zip_code": decrypted_as("zip_code"),
        "encrypted_phone": decrypted_as("phone"),
        "encrypted_occupation": decrypted_as("occupation"),
    },
)

ACTIVITIES_EXPORT: Final = TableExportMapper(
    Activity,
    (
        "id",
        "organization_id",
        "activity_type",
        "label",
        "tax_form",
        "property_id",
        "is_active",
        "created_at",
        "updated_at",
    ),
)

CLASSIFICATION_RULES_EXPORT: Final = TableExportMapper(
    ClassificationRule,
    (
        "id",
        "organization_id",
        "created_by",
        "match_type",
        "match_pattern",
        "match_context",
        "category",
        "sub_category",
        "property_id",
        "activity_id",
        "transaction_scope",
        "source",
        "priority",
        "times_applied",
        "is_active",
        "created_at",
        "updated_at",
    ),
)

CLASSIFICATION_RULE_SPLIT_PROPERTIES_EXPORT: Final = TableExportMapper(
    ClassificationRuleSplitProperty,
    (
        "id",
        "rule_id",
        "property_id",
        "position",
    ),
)

INTEGRATIONS_EXPORT: Final = TableExportMapper(
    Integration,
    (
        "id",
        "organization_id",
        "user_id",
        "provider",
        "last_synced_at",
        "created_at",
        "needs_reauth",
        "last_reauth_error",
        "last_reauth_failed_at",
    ),
    transformed_columns={"metadata": INTEGRATION_GMAIL_LABEL},
)

EXTRACTION_PROMPTS_EXPORT: Final = TableExportMapper(
    ExtractionPrompt,
    (
        "id",
        "user_id",
        "name",
        "prompt_text",
        "mode",
        "is_active",
        "created_at",
        "updated_at",
    ),
)

ACCOUNT_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    USERS_EXPORT,
    ORGANIZATIONS_EXPORT,
    ORGANIZATION_MEMBERS_EXPORT,
    TAX_PROFILES_EXPORT,
    TAXPAYER_PROFILES_EXPORT,
    ACTIVITIES_EXPORT,
    CLASSIFICATION_RULES_EXPORT,
    CLASSIFICATION_RULE_SPLIT_PROPERTIES_EXPORT,
    INTEGRATIONS_EXPORT,
    EXTRACTION_PROMPTS_EXPORT,
)
