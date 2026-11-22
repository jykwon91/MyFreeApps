"""Account data export mappers: listings and calendar."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.calendar.calendar_email_review_queue import CalendarEmailReviewQueue
from app.models.calendar.calendar_listing_blocklist import CalendarListingBlocklist
from app.models.listings.channel_listing import ChannelListing
from app.models.listings.listing import Listing
from app.models.listings.listing_blackout import ListingBlackout
from app.models.listings.listing_blackout_attachment import ListingBlackoutAttachment
from app.models.listings.listing_external_id import ListingExternalId
from app.models.listings.listing_photo import ListingPhoto

LISTINGS_EXPORT: Final = TableExportMapper(
    Listing,
    (
        "id",
        "organization_id",
        "user_id",
        "property_id",
        "title",
        "description",
        "slug",
        "monthly_rate",
        "weekly_rate",
        "nightly_rate",
        "min_stay_days",
        "max_stay_days",
        "room_type",
        "private_bath",
        "parking_assigned",
        "furnished",
        "status",
        "amenities",
        "pets_on_premises",
        "large_dog_disclosure",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

LISTING_PHOTOS_EXPORT: Final = TableExportMapper(
    ListingPhoto,
    (
        "id",
        "listing_id",
        "caption",
        "display_order",
        "created_at",
    ),
)

LISTING_EXTERNAL_IDS_EXPORT: Final = TableExportMapper(
    ListingExternalId,
    (
        "id",
        "listing_id",
        "source",
        "external_id",
        "external_url",
        "created_at",
    ),
)

LISTING_BLACKOUTS_EXPORT: Final = TableExportMapper(
    ListingBlackout,
    (
        "id",
        "listing_id",
        "starts_on",
        "ends_on",
        "source",
        "source_event_id",
        "host_notes",
        "created_at",
        "updated_at",
    ),
)

LISTING_BLACKOUT_ATTACHMENTS_EXPORT: Final = TableExportMapper(
    ListingBlackoutAttachment,
    (
        "id",
        "listing_blackout_id",
        "filename",
        "content_type",
        "size_bytes",
        "uploaded_by_user_id",
        "uploaded_at",
    ),
)

CHANNEL_LISTINGS_EXPORT: Final = TableExportMapper(
    ChannelListing,
    (
        "id",
        "listing_id",
        "channel_id",
        "external_url",
        "external_id",
        "last_imported_at",
        "last_import_error",
        "last_import_error_category",
        "created_at",
        "updated_at",
    ),
)

CALENDAR_EMAIL_REVIEW_QUEUE_EXPORT: Final = TableExportMapper(
    CalendarEmailReviewQueue,
    (
        "id",
        "user_id",
        "organization_id",
        "email_message_id",
        "source_channel",
        "parsed_payload",
        "status",
        "created_at",
        "resolved_at",
        "deleted_at",
    ),
)

CALENDAR_LISTING_BLOCKLIST_EXPORT: Final = TableExportMapper(
    CalendarListingBlocklist,
    (
        "id",
        "user_id",
        "organization_id",
        "source_channel",
        "source_listing_id",
        "reason",
        "created_at",
    ),
)

LISTING_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    LISTINGS_EXPORT,
    LISTING_PHOTOS_EXPORT,
    LISTING_EXTERNAL_IDS_EXPORT,
    LISTING_BLACKOUTS_EXPORT,
    LISTING_BLACKOUT_ATTACHMENTS_EXPORT,
    CHANNEL_LISTINGS_EXPORT,
    CALENDAR_EMAIL_REVIEW_QUEUE_EXPORT,
    CALENDAR_LISTING_BLOCKLIST_EXPORT,
)
