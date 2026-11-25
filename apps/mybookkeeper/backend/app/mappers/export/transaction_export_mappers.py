"""Account data export mappers: documents and transactions."""
from typing import Final

from app.mappers.export.table_export_mapper import TableExportMapper
from app.models.documents.document import Document
from app.models.transactions.booking_statement import BookingStatement
from app.models.transactions.reconciliation_match import ReconciliationMatch
from app.models.transactions.reconciliation_source import ReconciliationSource
from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_document import TransactionDocument

DOCUMENTS_EXPORT: Final = TableExportMapper(
    Document,
    (
        "id",
        "organization_id",
        "user_id",
        "property_id",
        "created_at",
        "updated_at",
        "file_name",
        "file_type",
        "file_mime_type",
        "email_message_id",
        "external_id",
        "external_source",
        "source",
        "status",
        "error_message",
        "batch_id",
        "document_type",
        "is_escrow_paid",
        "deleted_at",
    ),
)

TRANSACTIONS_EXPORT: Final = TableExportMapper(
    Transaction,
    (
        "id",
        "organization_id",
        "user_id",
        "property_id",
        "activity_id",
        "extraction_id",
        "vendor_id",
        "account_id",
        "transfer_to_account_id",
        "applicant_id",
        "attribution_source",
        "transaction_scope",
        "spending_category_id",
        "payer_name",
        "payer_handle",
        "transaction_date",
        "tax_year",
        "vendor",
        "normalized_vendor",
        "description",
        "amount",
        "transaction_type",
        "category",
        "sub_category",
        "usage_quantity",
        "usage_unit",
        "service_period_start",
        "service_period_end",
        "tags",
        "tax_relevant",
        "schedule_e_line",
        "is_capital_improvement",
        "placed_in_service_date",
        "channel",
        "address",
        "payment_method",
        "status",
        "status_before_personal_transfer",
        "review_fields",
        "review_reason",
        "reconciled",
        "reconciled_at",
        "is_manual",
        "external_id",
        "external_source",
        "external_category",
        "is_pending",
        "duplicate_reviewed_at",
        "deleted_at",
        "created_at",
        "updated_at",
    ),
)

TRANSACTION_DOCUMENTS_EXPORT: Final = TableExportMapper(
    TransactionDocument,
    (
        "id",
        "transaction_id",
        "document_id",
        "extraction_id",
        "link_type",
        "created_at",
    ),
)

BOOKING_STATEMENTS_EXPORT: Final = TableExportMapper(
    BookingStatement,
    (
        "id",
        "organization_id",
        "property_id",
        "transaction_id",
        "res_code",
        "platform",
        "check_in",
        "check_out",
        "nights",
        "gross_booking",
        "net_booking_revenue",
        "commission",
        "cleaning_fee",
        "insurance_fee",
        "net_client_earnings",
        "funds_due_to_client",
        "guest_name",
        "statement_period_start",
        "statement_period_end",
        "created_at",
    ),
)

RECONCILIATION_SOURCES_EXPORT: Final = TableExportMapper(
    ReconciliationSource,
    (
        "id",
        "organization_id",
        "user_id",
        "document_id",
        "source_type",
        "tax_year",
        "issuer",
        "reported_amount",
        "matched_amount",
        "discrepancy",
        "status",
        "created_at",
    ),
)

RECONCILIATION_MATCHES_EXPORT: Final = TableExportMapper(
    ReconciliationMatch,
    (
        "id",
        "reconciliation_source_id",
        "booking_statement_id",
        "matched_amount",
        "created_at",
    ),
)

TRANSACTION_EXPORT_MAPPERS: Final[tuple[TableExportMapper, ...]] = (
    DOCUMENTS_EXPORT,
    TRANSACTIONS_EXPORT,
    TRANSACTION_DOCUMENTS_EXPORT,
    BOOKING_STATEMENTS_EXPORT,
    RECONCILIATION_SOURCES_EXPORT,
    RECONCILIATION_MATCHES_EXPORT,
)
