"""Account data export mappers: welcome manuals."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.welcome_manuals.welcome_manual import WelcomeManual
from app.models.welcome_manuals.welcome_manual_place import WelcomeManualPlace
from app.models.welcome_manuals.welcome_manual_room import WelcomeManualRoom
from app.models.welcome_manuals.welcome_manual_section import WelcomeManualSection
from app.models.welcome_manuals.welcome_manual_section_field import (
    WelcomeManualSectionField,
)
from app.models.welcome_manuals.welcome_manual_section_image import (
    WelcomeManualSectionImage,
)
from app.models.welcome_manuals.welcome_manual_send import WelcomeManualSend

WELCOME_MANUALS_EXPORT: Final = TableExportMapper(
    WelcomeManual,
    (
        "id",
        "organization_id",
        "user_id",
        "property_id",
        "title",
        "intro_text",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

WELCOME_MANUAL_ROOMS_EXPORT: Final = TableExportMapper(
    WelcomeManualRoom,
    (
        "id",
        "manual_id",
        "name",
        "display_order",
        "created_at",
        "updated_at",
    ),
)

WELCOME_MANUAL_SECTIONS_EXPORT: Final = TableExportMapper(
    WelcomeManualSection,
    (
        "id",
        "manual_id",
        "room_id",
        "title",
        "body",
        "display_order",
        "created_at",
        "updated_at",
    ),
)

WELCOME_MANUAL_SECTION_FIELDS_EXPORT: Final = TableExportMapper(
    WelcomeManualSectionField,
    (
        "id",
        "section_id",
        "label",
        "value",
        "display_order",
        "created_at",
    ),
)

WELCOME_MANUAL_SECTION_IMAGES_EXPORT: Final = TableExportMapper(
    WelcomeManualSectionImage,
    (
        "id",
        "section_id",
        "caption",
        "display_order",
        "created_at",
    ),
)

WELCOME_MANUAL_PLACES_EXPORT: Final = TableExportMapper(
    WelcomeManualPlace,
    (
        "id",
        "manual_id",
        "name",
        "cuisine",
        "price_tier",
        "note",
        "map_url",
        "display_order",
        "created_at",
    ),
)

WELCOME_MANUAL_SENDS_EXPORT: Final = TableExportMapper(
    WelcomeManualSend,
    (
        "id",
        "manual_id",
        "recipient_email",
        "recipient_name",
        "status",
        "error_reason",
        "created_at",
    ),
)

WELCOME_MANUAL_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    WELCOME_MANUALS_EXPORT,
    WELCOME_MANUAL_ROOMS_EXPORT,
    WELCOME_MANUAL_SECTIONS_EXPORT,
    WELCOME_MANUAL_SECTION_FIELDS_EXPORT,
    WELCOME_MANUAL_SECTION_IMAGES_EXPORT,
    WELCOME_MANUAL_PLACES_EXPORT,
    WELCOME_MANUAL_SENDS_EXPORT,
)
