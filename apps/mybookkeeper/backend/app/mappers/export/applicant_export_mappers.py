"""Account data export mappers: applicants and vendors."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.applicants.applicant import Applicant
from app.models.applicants.applicant_event import ApplicantEvent
from app.models.applicants.reference import Reference
from app.models.applicants.screening_result import ScreeningResult
from app.models.applicants.video_call_note import VideoCallNote
from app.models.vendors.vendor import Vendor

APPLICANTS_EXPORT: Final = TableExportMapper(
    Applicant,
    (
        "id",
        "organization_id",
        "user_id",
        "inquiry_id",
        "legal_name",
        "dob",
        "employer_or_hospital",
        "vehicle_make_model",
        "contact_email",
        "contact_phone",
        "contract_start",
        "smoker",
        "pets",
        "referred_by",
        "stage",
        "tenant_ended_at",
        "tenant_ended_reason",
        "deleted_at",
        "sensitive_purged_at",
        "created_at",
        "updated_at",
    ),
)

APPLICANT_EVENTS_EXPORT: Final = TableExportMapper(
    ApplicantEvent,
    (
        "id",
        "applicant_id",
        "event_type",
        "actor",
        "notes",
        "payload",
        "occurred_at",
        "created_at",
    ),
)

APPLICANT_REFERENCES_EXPORT: Final = TableExportMapper(
    Reference,
    (
        "id",
        "applicant_id",
        "relationship",
        "reference_name",
        "reference_contact",
        "notes",
        "contacted_at",
        "created_at",
        "updated_at",
    ),
)

SCREENING_RESULTS_EXPORT: Final = TableExportMapper(
    ScreeningResult,
    (
        "id",
        "applicant_id",
        "provider",
        "status",
        "adverse_action_snippet",
        "notes",
        "requested_at",
        "completed_at",
        "uploaded_at",
        "uploaded_by_user_id",
        "created_at",
    ),
)

VIDEO_CALL_NOTES_EXPORT: Final = TableExportMapper(
    VideoCallNote,
    (
        "id",
        "applicant_id",
        "scheduled_at",
        "completed_at",
        "notes",
        "gut_rating",
        "created_at",
        "updated_at",
    ),
)

VENDORS_EXPORT: Final = TableExportMapper(
    Vendor,
    (
        "id",
        "organization_id",
        "user_id",
        "name",
        "category",
        "phone",
        "email",
        "address",
        "hourly_rate",
        "flat_rate_notes",
        "preferred",
        "notes",
        "last_used_at",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

APPLICANT_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    APPLICANTS_EXPORT,
    APPLICANT_EVENTS_EXPORT,
    APPLICANT_REFERENCES_EXPORT,
    SCREENING_RESULTS_EXPORT,
    VIDEO_CALL_NOTES_EXPORT,
    VENDORS_EXPORT,
)
