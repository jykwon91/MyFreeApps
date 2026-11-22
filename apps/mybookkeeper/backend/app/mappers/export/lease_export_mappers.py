"""Account data export mappers: lease templates and signed leases."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.leases.lease_template import LeaseTemplate
from app.models.leases.lease_template_file import LeaseTemplateFile
from app.models.leases.lease_template_placeholder import LeaseTemplatePlaceholder
from app.models.leases.lease_term_version import LeaseTermVersion
from app.models.leases.pending_rent_receipt import PendingRentReceipt
from app.models.leases.signed_lease import SignedLease
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.models.leases.signed_lease_template import SignedLeaseTemplate

LEASE_TEMPLATES_EXPORT: Final = TableExportMapper(
    LeaseTemplate,
    (
        "id",
        "user_id",
        "organization_id",
        "name",
        "description",
        "version",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

LEASE_TEMPLATE_FILES_EXPORT: Final = TableExportMapper(
    LeaseTemplateFile,
    (
        "id",
        "template_id",
        "filename",
        "content_type",
        "size_bytes",
        "display_order",
        "created_at",
    ),
)

LEASE_TEMPLATE_PLACEHOLDERS_EXPORT: Final = TableExportMapper(
    LeaseTemplatePlaceholder,
    (
        "id",
        "template_id",
        "key",
        "display_label",
        "input_type",
        "required",
        "default_source",
        "computed_expr",
        "display_order",
        "created_at",
        "updated_at",
    ),
)

SIGNED_LEASES_EXPORT: Final = TableExportMapper(
    SignedLease,
    (
        "id",
        "user_id",
        "organization_id",
        "applicant_id",
        "listing_id",
        "parent_lease_id",
        "kind",
        "values",
        "status",
        "starts_on",
        "ends_on",
        "generated_at",
        "sent_at",
        "signed_at",
        "ended_at",
        "notes",
        "auto_email_tenant",
        "last_emailed_to_tenant_at",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

SIGNED_LEASE_ATTACHMENTS_EXPORT: Final = TableExportMapper(
    SignedLeaseAttachment,
    (
        "id",
        "lease_id",
        "filename",
        "content_type",
        "size_bytes",
        "kind",
        "uploaded_by_user_id",
        "uploaded_at",
        "signed_by_tenant_at",
        "signed_by_landlord_at",
        "emailed_to_tenant_at",
    ),
)

SIGNED_LEASE_TEMPLATES_EXPORT: Final = TableExportMapper(
    SignedLeaseTemplate,
    (
        "lease_id",
        "template_id",
        "display_order",
        "template_name_snapshot",
        "template_version_snapshot",
        "created_at",
    ),
)

LEASE_TERM_VERSIONS_EXPORT: Final = TableExportMapper(
    LeaseTermVersion,
    (
        "id",
        "lease_id",
        "starts_on",
        "ends_on",
        "source_attachment_id",
        "created_by_user_id",
        "created_at",
        "deleted_at",
    ),
)

PENDING_RENT_RECEIPTS_EXPORT: Final = TableExportMapper(
    PendingRentReceipt,
    (
        "id",
        "user_id",
        "organization_id",
        "transaction_id",
        "applicant_id",
        "signed_lease_id",
        "period_start_date",
        "period_end_date",
        "status",
        "sent_at",
        "send_message_id",
        "sent_via_attachment_id",
        "sender_gmail_address",
        "created_at",
        "updated_at",
        "deleted_at",
    ),
)

LEASE_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    LEASE_TEMPLATES_EXPORT,
    LEASE_TEMPLATE_FILES_EXPORT,
    LEASE_TEMPLATE_PLACEHOLDERS_EXPORT,
    SIGNED_LEASES_EXPORT,
    SIGNED_LEASE_ATTACHMENTS_EXPORT,
    SIGNED_LEASE_TEMPLATES_EXPORT,
    LEASE_TERM_VERSIONS_EXPORT,
    PENDING_RENT_RECEIPTS_EXPORT,
)
