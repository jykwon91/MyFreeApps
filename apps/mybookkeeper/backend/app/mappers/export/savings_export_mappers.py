"""Account data export mappers: researched savings ideas and the research on/off choice."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.savings.savings_idea import SavingsIdea
from app.models.savings.savings_research_setting import SavingsResearchSetting

SAVINGS_IDEAS_EXPORT: Final = TableExportMapper(
    SavingsIdea,
    (
        "id",
        "organization_id",
        "user_id",
        "last_run_id",
        "idea_key",
        "category",
        "subject",
        "title",
        "savings_low_cents",
        "savings_high_cents",
        "effort",
        "why_it_fits",
        "steps",
        "source_urls",
        "card_details",
        "expires_on",
        "status",
        "status_changed_at",
        "first_found_at",
        "last_confirmed_at",
        "created_at",
        "updated_at",
    ),
)

SAVINGS_RESEARCH_SETTINGS_EXPORT: Final = TableExportMapper(
    SavingsResearchSetting,
    (
        "id",
        "organization_id",
        "user_id",
        "enabled",
        "enabled_at",
        "created_at",
        "updated_at",
    ),
)

SAVINGS_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    SAVINGS_IDEAS_EXPORT,
    SAVINGS_RESEARCH_SETTINGS_EXPORT,
)
