"""Account data export mappers: inquiries."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.inquiries.inquiry import Inquiry
from app.models.inquiries.inquiry_event import InquiryEvent
from app.models.inquiries.inquiry_message import InquiryMessage
from app.models.inquiries.inquiry_reply_send import InquiryReplySend
from app.models.inquiries.inquiry_spam_assessment import InquirySpamAssessment
from app.models.inquiries.reply_template import ReplyTemplate

INQUIRIES_EXPORT: Final = TableExportMapper(
    Inquiry,
    (
        "id",
        "organization_id",
        "user_id",
        "listing_id",
        "source",
        "external_inquiry_id",
        "inquirer_name",
        "inquirer_email",
        "inquirer_phone",
        "inquirer_employer",
        "desired_start_date",
        "desired_end_date",
        "stage",
        "gut_rating",
        "notes",
        "received_at",
        "email_message_id",
        "submitted_via",
        "spam_status",
        "spam_score",
        "occupant_count",
        "has_pets",
        "pets_description",
        "vehicle_count",
        "current_city",
        "current_country",
        "current_region",
        "employment_status",
        "why_this_room",
        "additional_notes",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

INQUIRY_EVENTS_EXPORT: Final = TableExportMapper(
    InquiryEvent,
    (
        "id",
        "inquiry_id",
        "event_type",
        "actor",
        "notes",
        "occurred_at",
        "created_at",
    ),
)

INQUIRY_MESSAGES_EXPORT: Final = TableExportMapper(
    InquiryMessage,
    (
        "id",
        "inquiry_id",
        "direction",
        "channel",
        "from_address",
        "to_address",
        "subject",
        "raw_email_body",
        "parsed_body",
        "email_message_id",
        "sent_at",
        "created_at",
    ),
)

INQUIRY_REPLY_SENDS_EXPORT: Final = TableExportMapper(
    InquiryReplySend,
    (
        "id",
        "inquiry_id",
        "status",
        "send_message_id",
        "inquiry_message_id",
        "sender_gmail_address",
        "created_at",
        "updated_at",
    ),
)

INQUIRY_SPAM_ASSESSMENTS_EXPORT: Final = TableExportMapper(
    InquirySpamAssessment,
    (
        "id",
        "inquiry_id",
        "assessment_type",
        "passed",
        "score",
        "flags",
        "details_json",
        "created_at",
    ),
)

REPLY_TEMPLATES_EXPORT: Final = TableExportMapper(
    ReplyTemplate,
    (
        "id",
        "organization_id",
        "user_id",
        "name",
        "subject_template",
        "body_template",
        "is_archived",
        "display_order",
        "created_at",
        "updated_at",
    ),
)

INQUIRY_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    INQUIRIES_EXPORT,
    INQUIRY_EVENTS_EXPORT,
    INQUIRY_MESSAGES_EXPORT,
    INQUIRY_REPLY_SENDS_EXPORT,
    INQUIRY_SPAM_ASSESSMENTS_EXPORT,
    REPLY_TEMPLATES_EXPORT,
)
