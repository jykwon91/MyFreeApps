"""Service layer for lease templates.

Per layered-architecture: routes thin, services orchestrate, repositories own
queries. Tenant isolation is via ``(user_id, organization_id)`` per the
project's existing convention. Tenant scope is checked first on every call —
cross-tenant access returns the same response shape as a missing row.

Uploading and replacing template files lives in
``lease_template_upload_service`` (atomic: storage first, one DB transaction).
"""
from __future__ import annotations

import datetime
import uuid

from platform_shared.core.storage import StorageNotConfiguredError

from app.db.session import unit_of_work
from app.repositories.applicants import applicant_repo
from app.repositories.inquiries.inquiry_repo import get_by_applicant_inquiry_id
from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_placeholder_repo,
    lease_template_repo,
    signed_lease_template_repo,
)
from app.schemas.leases.lease_template_file_response import (
    LeaseTemplateFileResponse,
)
from app.schemas.leases.lease_template_list_response import (
    LeaseTemplateListResponse,
)
from app.schemas.leases.lease_template_placeholder_response import (
    LeaseTemplatePlaceholderResponse,
)
from app.schemas.leases.lease_template_response import LeaseTemplateResponse
from app.schemas.leases.lease_template_summary import LeaseTemplateSummary
from app.services.leases.attachment_response_builder import (
    attach_presigned_urls_to_files,
)
from app.services.leases.computed import ComputedExprError, validate_expr
from app.services.leases.default_source_resolver import (
    resolve_default_source,
    validate_default_source_spec,
)
from app.services.leases.exceptions.template_file_unreadable_error import (
    TemplateFileUnreadableError,
)
from app.services.leases.exceptions.template_no_files_error import TemplateNoFilesError
from app.services.leases.exceptions.template_storage_unavailable_error import (
    TemplateStorageUnavailableError,
)
from app.services.leases.exceptions.template_too_many_files_error import (
    TemplateTooManyFilesError,
)
from app.services.leases.lease_template_placeholder_service import (
    TemplateNotFoundError,
    suggest_ai_placeholders,
)
from app.services.leases.lease_template_render_service import (
    load_template_source_texts,
)

# ---------------------------------------------------------------------------
# Allowlist for upload content types
# ---------------------------------------------------------------------------

ALLOWED_TEMPLATE_MIME_TYPES: frozenset[str] = frozenset({
    "text/markdown",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
})

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

# TemplateNotFoundError is imported from lease_template_placeholder_service
# (the shared seam) so all three modules share the same class object.

class TemplateFileTooLargeError(ValueError):
    pass


class TemplateFileTypeRejectedError(ValueError):
    pass


class TemplateInUseError(RuntimeError):
    """Template cannot be soft-deleted — active signed leases reference it."""


class InvalidComputedExprError(ValueError):
    pass


class InvalidDefaultSourceError(ValueError):
    pass


class PlaceholderNotFoundError(LookupError):
    pass


class ApplicantNotFoundError(LookupError):
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalise_content_type(declared: str | None, filename: str) -> str:
    """Resolve a content type when the upload omits one or sends octet-stream.

    DOCX uploads frequently arrive as ``application/octet-stream`` from
    browser drag-drop, so we fall back to the filename extension.
    """
    if declared and declared in ALLOWED_TEMPLATE_MIME_TYPES:
        return declared
    lower = filename.lower()
    if lower.endswith(".docx"):
        return DOCX_MIME
    if lower.endswith(".md"):
        return "text/markdown"
    if lower.endswith(".txt"):
        return "text/plain"
    if declared:
        return declared
    return "application/octet-stream"


def _build_summary_from_orm(template, *, file_count: int, placeholder_count: int) -> LeaseTemplateSummary:
    return LeaseTemplateSummary(
        id=template.id,
        user_id=template.user_id,
        organization_id=template.organization_id,
        name=template.name,
        description=template.description,
        version=template.version,
        file_count=file_count,
        placeholder_count=placeholder_count,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def _build_detail_from_orm(template, files, placeholders) -> LeaseTemplateResponse:
    file_responses = [LeaseTemplateFileResponse.model_validate(f) for f in files]
    placeholder_responses = [
        LeaseTemplatePlaceholderResponse.model_validate(p) for p in placeholders
    ]
    file_responses = attach_presigned_urls_to_files(file_responses)
    return LeaseTemplateResponse(
        id=template.id,
        user_id=template.user_id,
        organization_id=template.organization_id,
        name=template.name,
        description=template.description,
        version=template.version,
        files=file_responses,
        placeholders=placeholder_responses,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


# ---------------------------------------------------------------------------
# List (GET)
# ---------------------------------------------------------------------------

async def list_templates(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
) -> LeaseTemplateListResponse:
    async with unit_of_work() as db:
        rows = await lease_template_repo.list_for_tenant(
            db,
            user_id=user_id,
            organization_id=organization_id,
            limit=limit,
            offset=offset,
        )
        total = await lease_template_repo.count_for_tenant(
            db,
            user_id=user_id,
            organization_id=organization_id,
        )
        items: list[LeaseTemplateSummary] = []
        for template in rows:
            files = await lease_template_file_repo.list_for_template(
                db, template_id=template.id,
            )
            placeholders = await lease_template_placeholder_repo.list_for_template(
                db, template_id=template.id,
            )
            items.append(
                _build_summary_from_orm(
                    template,
                    file_count=len(files),
                    placeholder_count=len(placeholders),
                )
            )
    return LeaseTemplateListResponse(
        items=items,
        total=total,
        has_more=(offset + len(items)) < total,
    )


# ---------------------------------------------------------------------------
# Get detail
# ---------------------------------------------------------------------------

async def get_template(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
) -> LeaseTemplateResponse:
    async with unit_of_work() as db:
        template = await lease_template_repo.get(
            db,
            template_id=template_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if template is None:
            raise TemplateNotFoundError(f"Template {template_id} not found")
        files = await lease_template_file_repo.list_for_template(
            db, template_id=template.id,
        )
        placeholders = await lease_template_placeholder_repo.list_for_template(
            db, template_id=template.id,
        )
    return _build_detail_from_orm(template, files, placeholders)


# ---------------------------------------------------------------------------
# Resolve generate-defaults for a template + applicant pair
# ---------------------------------------------------------------------------

async def generate_defaults_multi(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    template_ids: list[uuid.UUID],
    applicant_id: uuid.UUID,
    today: datetime.date,
) -> list[dict]:
    """Return merged placeholders + resolved defaults across N templates.

    Merge rule: **first-template-wins** for placeholders defined in 2+
    templates. The resolved value/provenance comes from the FIRST template
    that defines the key (in the order ``template_ids`` was passed).

    Each result includes ``template_ids``, the IDs of every template that
    defines that key — so the UI can show "Used by: Template A, Template B".

    Returns a list of dicts with ``placeholder`` (full schema), ``template_ids``,
    ``value``, and ``provenance`` fields.
    """
    if not template_ids:
        raise TemplateNotFoundError("At least one template_id is required")

    async with unit_of_work() as db:
        # Validate all templates belong to caller and load placeholders.
        placeholders_by_template: dict[uuid.UUID, list] = {}
        for tid in template_ids:
            template = await lease_template_repo.get(
                db,
                template_id=tid,
                user_id=user_id,
                organization_id=organization_id,
            )
            if template is None:
                raise TemplateNotFoundError(f"Template {tid} not found")
            placeholders_by_template[tid] = (
                await lease_template_placeholder_repo.list_for_template(
                    db, template_id=tid,
                )
            )

        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise ApplicantNotFoundError(f"Applicant {applicant_id} not found")

        inquiry = None
        if applicant.inquiry_id is not None:
            inquiry = await get_by_applicant_inquiry_id(
                db,
                inquiry_id=applicant.inquiry_id,
                organization_id=organization_id,
                user_id=user_id,
            )

    # Merge across templates: first-template-wins. For each key, capture the
    # full set of templates that define it (for UI surfacing).
    seen_keys: dict[str, dict] = {}
    for tid in template_ids:
        for p in placeholders_by_template.get(tid, []):
            if p.input_type in ("signature", "computed"):
                continue
            if p.key in seen_keys:
                # Record this additional template as a contributor.
                seen_keys[p.key]["template_ids"].append(tid)
                continue
            if p.default_source:
                value, provenance = resolve_default_source(
                    p.default_source, applicant, inquiry, today=today,
                )
            else:
                value, provenance = None, None
            seen_keys[p.key] = {
                "placeholder": p,
                "template_ids": [tid],
                "value": value,
                "provenance": provenance,
            }

    return list(seen_keys.values())


async def generate_defaults(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    applicant_id: uuid.UUID,
    today: datetime.date,
) -> list[dict]:
    """Return resolved default values for each placeholder in a template.

    For each placeholder with a ``default_source`` spec, evaluates the spec
    against the applicant row and (if the applicant has a linked inquiry) the
    inquiry row. Returns a list of dicts with ``key``, ``value``, and
    ``provenance`` fields.

    Placeholders without ``default_source`` are included with ``value=None``
    and ``provenance=None`` so the frontend can render all fields in one pass.
    """
    async with unit_of_work() as db:
        template = await lease_template_repo.get(
            db,
            template_id=template_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if template is None:
            raise TemplateNotFoundError(f"Template {template_id} not found")

        applicant = await applicant_repo.get(
            db,
            applicant_id=applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            raise ApplicantNotFoundError(f"Applicant {applicant_id} not found")

        inquiry = None
        if applicant.inquiry_id is not None:
            inquiry = await get_by_applicant_inquiry_id(
                db,
                inquiry_id=applicant.inquiry_id,
                organization_id=organization_id,
                user_id=user_id,
            )

        placeholders = await lease_template_placeholder_repo.list_for_template(
            db, template_id=template_id,
        )

    defaults: list[dict] = []
    for p in placeholders:
        if p.input_type in ("signature", "computed"):
            continue
        if p.default_source:
            value, provenance = resolve_default_source(
                p.default_source, applicant, inquiry, today=today,
            )
        else:
            value, provenance = None, None
        defaults.append({
            "key": p.key,
            "value": value,
            "provenance": provenance,
        })

    return defaults


# ---------------------------------------------------------------------------
# Update template metadata (name / description)
# ---------------------------------------------------------------------------

async def update_template_metadata(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    name: str | None,
    description: str | None,
) -> LeaseTemplateResponse:
    async with unit_of_work() as db:
        # Locked so this serialises with a concurrent replace of the files.
        await lease_template_repo.get(
            db, template_id=template_id, user_id=user_id,
            organization_id=organization_id, for_update=True,
        )
        updated = await lease_template_repo.update_metadata(
            db,
            template_id=template_id,
            user_id=user_id,
            organization_id=organization_id,
            name=name,
            description=description,
        )
        if updated is None:
            raise TemplateNotFoundError(f"Template {template_id} not found")
    return await get_template(
        user_id=user_id,
        organization_id=organization_id,
        template_id=template_id,
    )


# ---------------------------------------------------------------------------
# Update placeholder spec
# ---------------------------------------------------------------------------

async def update_placeholder(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    placeholder_id: uuid.UUID,
    fields: dict[str, object],
) -> LeaseTemplatePlaceholderResponse:
    # Tenant scope: confirm the template belongs to caller first; locked so this serialises with a replace.
    async with unit_of_work() as db:
        template = await lease_template_repo.get(
            db,
            template_id=template_id,
            user_id=user_id,
            organization_id=organization_id,
            for_update=True,
        )
        if template is None:
            raise TemplateNotFoundError(f"Template {template_id} not found")

        placeholder = (
            await lease_template_placeholder_repo.get_by_id_scoped_to_template(
                db,
                placeholder_id=placeholder_id,
                template_id=template_id,
            )
        )
        if placeholder is None:
            raise PlaceholderNotFoundError(
                f"Placeholder {placeholder_id} not found"
            )

        # Build the field dict, validating computed_expr against the DSL
        # allowlist before any write happens. The repository owns the actual
        # ORM mutations + flush — keeps the layered architecture clean.
        update_payload: dict[str, object] = {}
        if "computed_expr" in fields:
            expr = fields["computed_expr"]
            if expr is None or expr == "":
                update_payload["computed_expr"] = None
            else:
                try:
                    validate_expr(expr)  # type: ignore[arg-type]
                except ComputedExprError as exc:
                    raise InvalidComputedExprError(str(exc)) from exc
                update_payload["computed_expr"] = expr
        if "display_label" in fields and fields["display_label"] is not None:
            update_payload["display_label"] = fields["display_label"]
        if "input_type" in fields and fields["input_type"] is not None:
            update_payload["input_type"] = fields["input_type"]
        if "required" in fields and fields["required"] is not None:
            update_payload["required"] = bool(fields["required"])
        if "default_source" in fields:
            ds = fields["default_source"]
            if ds is not None and ds != "":
                try:
                    validate_default_source_spec(ds)  # type: ignore[arg-type]
                except ValueError as exc:
                    raise InvalidDefaultSourceError(str(exc)) from exc
            update_payload["default_source"] = ds
        if "display_order" in fields and fields["display_order"] is not None:
            update_payload["display_order"] = int(fields["display_order"])  # type: ignore[arg-type]

        updated = await lease_template_placeholder_repo.update_fields(
            db,
            placeholder=placeholder,
            fields=update_payload,
        )
        return LeaseTemplatePlaceholderResponse.model_validate(updated)


# ---------------------------------------------------------------------------
# Soft-delete
# ---------------------------------------------------------------------------

async def soft_delete_template(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        template = await lease_template_repo.get(
            db,
            template_id=template_id,
            user_id=user_id,
            organization_id=organization_id,
            for_update=True,
        )
        if template is None:
            raise TemplateNotFoundError(f"Template {template_id} not found")
        in_use = await signed_lease_template_repo.has_active_lease_for_template(
            db, template_id=template_id,
        )
        if in_use:
            raise TemplateInUseError(
                "Cannot delete template — active leases reference it",
            )
        await lease_template_repo.soft_delete(
            db,
            template_id=template_id,
            user_id=user_id,
            organization_id=organization_id,
        )


# ---------------------------------------------------------------------------
# Back-compat re-exports
# ---------------------------------------------------------------------------
# ``suggest_ai_placeholders`` and ``load_template_source_texts`` are imported at
# the top of this module from their focused modules and are therefore already
# present in this namespace, satisfying any existing callers that do:
#   from app.services.leases.lease_template_service import suggest_ai_placeholders
#   from app.services.leases.lease_template_service import load_template_source_texts

__all__ = [
    # Constants
    "ALLOWED_TEMPLATE_MIME_TYPES",
    "DOCX_MIME",
    # Exceptions
    "TemplateNotFoundError",
    "TemplateFileTooLargeError",
    "TemplateFileTypeRejectedError",
    "TemplateFileUnreadableError",
    "TemplateNoFilesError",
    "TemplateStorageUnavailableError",
    "TemplateTooManyFilesError",
    "TemplateInUseError",
    "InvalidComputedExprError",
    "InvalidDefaultSourceError",
    "PlaceholderNotFoundError",
    "ApplicantNotFoundError",
    # Also re-export StorageNotConfiguredError so route handlers that currently
    # catch it from this module continue to work without change.
    "StorageNotConfiguredError",
    # CRUD
    "list_templates",
    "get_template",
    "generate_defaults",
    "generate_defaults_multi",
    "update_template_metadata",
    "update_placeholder",
    "soft_delete_template",
    # Moved to focused modules (re-exported for back-compat)
    "load_template_source_texts",
    "suggest_ai_placeholders",
]
