"""Account data export mappers: rent."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.rent.rent_charge import RentCharge
from app.models.rent.rent_reminder_plan import RentReminderPlan
from app.models.rent.rent_reminder_send import RentReminderSend
from app.models.rent.rent_schedule import RentSchedule
from app.models.transactions.payer_alias import PayerAlias
from app.models.transactions.rent_attribution_review_queue import (
    RentAttributionReviewQueue,
)

RENT_SCHEDULES_EXPORT: Final = TableExportMapper(
    RentSchedule,
    (
        "id",
        "user_id",
        "organization_id",
        "applicant_id",
        "property_id",
        "amount",
        "cadence",
        "start_date",
        "end_date",
        "grace_days",
        "notes",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

RENT_CHARGES_EXPORT: Final = TableExportMapper(
    RentCharge,
    (
        "id",
        "user_id",
        "organization_id",
        "applicant_id",
        "schedule_id",
        "charge_type",
        "period_start",
        "period_end",
        "due_date",
        "amount",
        "description",
        "waived_at",
        "waived_reason",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

RENT_REMINDER_PLANS_EXPORT: Final = TableExportMapper(
    RentReminderPlan,
    (
        "id",
        "user_id",
        "organization_id",
        "applicant_id",
        "frequency",
        "due_weekday",
        "send_days_before",
        "send_time",
        "timezone",
        "email_enabled",
        "sms_enabled",
        "amount_override",
        "payment_instructions",
        "is_active",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

RENT_REMINDER_SENDS_EXPORT: Final = TableExportMapper(
    RentReminderSend,
    (
        "id",
        "plan_id",
        "applicant_id",
        "organization_id",
        "user_id",
        "due_date",
        "channel",
        "status",
        "amount",
        "message_body",
        "attempt",
        "provider_message_id",
        "error_code",
        "created_at",
        "sent_at",
        "confirmed_at",
        "operator_alerted_at",
        "updated_at",
    ),
)

PAYER_ALIAS_EXPORT: Final = TableExportMapper(
    PayerAlias,
    (
        "id",
        "user_id",
        "organization_id",
        "normalized_payer_name",
        "payer_handle",
        "applicant_id",
        "source",
        "created_at",
        "updated_at",
    ),
)

RENT_ATTRIBUTION_REVIEW_QUEUE_EXPORT: Final = TableExportMapper(
    RentAttributionReviewQueue,
    (
        "id",
        "user_id",
        "organization_id",
        "transaction_id",
        "proposed_applicant_id",
        "proposed_property_id",
        "confidence",
        "status",
        "created_at",
        "resolved_at",
        "deleted_at",
    ),
)

RENT_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    RENT_SCHEDULES_EXPORT,
    RENT_CHARGES_EXPORT,
    RENT_REMINDER_PLANS_EXPORT,
    RENT_REMINDER_SENDS_EXPORT,
    PAYER_ALIAS_EXPORT,
    RENT_ATTRIBUTION_REVIEW_QUEUE_EXPORT,
)
