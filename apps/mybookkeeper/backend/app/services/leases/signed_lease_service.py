"""Signed lease service — thin re-export module.

All implementation has been split into focused modules. This file re-exports
every public name so existing callers (API routes, workers, tests) continue
to work without changes.

Implementation lives in:
  _lease_helpers.py         — exceptions, constants, private shared helpers
  lease_lifecycle_service.py — create / list / get / update / soft-delete
  lease_pdf_service.py      — generate / add_templates_and_generate
  lease_prefill_service.py  — prefill_addendum_placeholders
  lease_import_service.py   — import + kind-inference heuristics
  lease_attachment_service.py — upload / list / update / delete attachments
"""
from __future__ import annotations

# Exceptions (from helpers — shared across all modules)
from app.services.leases._lease_helpers import (
    AttachmentNotFoundError,
    AttachmentTooLargeError,
    AttachmentTypeRejectedError,
    ALLOWED_ATTACHMENT_MIME_TYPES,
    CannotEditValuesError,
    InvalidAttachmentKindError,
    InvalidParentLeaseError,
    InvalidStatusTransitionError,
    MissingRequiredValuesError,
    SignedLeaseNotFoundError,
    StorageNotConfiguredError,
    SuccessorAlreadyExistsError,
)

# Lifecycle
from app.services.leases.lease_lifecycle_service import (
    create_lease,
    get_lease,
    list_leases,
    soft_delete_lease,
    update_lease,
)

# PDF generation
from app.services.leases.lease_pdf_service import (
    ImportedLeaseTemplateError,
    TemplatesAlreadyLinkedError,
    add_templates_and_generate,
    generate_lease,
    render_md_text_to_pdf_or_keep,
    should_auto_email_after_generate,
)

# Placeholder pre-fill
from app.services.leases.lease_prefill_service import prefill_addendum_placeholders

# Import
from app.services.leases.lease_import_service import (
    ApplicantNotFoundError,
    ListingNotFoundError,
    import_signed_lease,
    infer_kind_from_filename,
    infer_kinds_for_files,
)

# Attachments
from app.services.leases.lease_attachment_service import (
    delete_attachment,
    list_attachments,
    update_attachment_kind,
    update_attachment_signing_state,
    upload_attachment,
)

__all__ = [
    # Exceptions
    "AttachmentNotFoundError",
    "AttachmentTooLargeError",
    "AttachmentTypeRejectedError",
    "ALLOWED_ATTACHMENT_MIME_TYPES",
    "CannotEditValuesError",
    "InvalidAttachmentKindError",
    "InvalidParentLeaseError",
    "InvalidStatusTransitionError",
    "MissingRequiredValuesError",
    "SignedLeaseNotFoundError",
    "StorageNotConfiguredError",
    "SuccessorAlreadyExistsError",
    "ImportedLeaseTemplateError",
    "TemplatesAlreadyLinkedError",
    "ApplicantNotFoundError",
    "ListingNotFoundError",
    # Lifecycle
    "create_lease",
    "get_lease",
    "list_leases",
    "soft_delete_lease",
    "update_lease",
    # PDF generation
    "add_templates_and_generate",
    "generate_lease",
    "prefill_addendum_placeholders",
    "render_md_text_to_pdf_or_keep",
    "should_auto_email_after_generate",
    # Import
    "import_signed_lease",
    "infer_kind_from_filename",
    "infer_kinds_for_files",
    # Attachments
    "delete_attachment",
    "list_attachments",
    "update_attachment_kind",
    "update_attachment_signing_state",
    "upload_attachment",
]
