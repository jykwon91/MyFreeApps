"""Service layer for signed leases.

Handles the lease lifecycle: draft → generated → sent → signed → active.

Pipeline for ``generate``:
    load template files → run placeholder substitution per file →
    upload rendered output to MinIO under ``signed-leases/<lease_id>/`` →
    create ``signed_lease_attachments`` rows with kind=rendered_original →
    transition status to ``generated`` and stamp ``generated_at`` →
    re-fetch detail with attachments and presigned URLs.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from typing import Any

from app.core.lease_enums import SIGNED_LEASE_STATUSES
from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_placeholder_repo,
    lease_template_repo,
    signed_lease_attachment_repo,
    signed_lease_repo,
)
from app.schemas.leases.signed_lease_attachment_response import (
    SignedLeaseAttachmentResponse,
)
from app.schemas.leases.signed_lease_list_response import (
    SignedLeaseListResponse,
)
from app.schemas.leases.signed_lease_response import SignedLeaseResponse
from app.schemas.leases.signed_lease_summary import SignedLeaseSummary
from app.services.leases.attachment_response_builder import (
    attach_presigned_urls_to_attachments,
)
from app.services.leases.computed import ComputedExprError, evaluate
from app.services.leases.renderer import (
    render_docx_bytes,
    render_md,
    render_pdf_from_text,
)
from app.services.leases.lease_template_service import (
    DOCX_MIME,
    TemplateNotFoundError,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class SignedLeaseNotFoundError(LookupError):
    pass


class AttachmentNotFoundError(LookupError):
    pass


class StorageNotConfiguredError(RuntimeError):
    pass


class MissingRequiredValuesError(ValueError):
    pass


class InvalidStatusTransitionError(ValueError):
    pass


class CannotEditValuesError(ValueError):
    """``values`` can only be edited while status=draft."""


class AttachmentTooLargeError(ValueError):
    pass


class AttachmentTypeRejectedError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Allowlist for signed-lease attachment uploads.
# ---------------------------------------------------------------------------

ALLOWED_ATTACHMENT_MIME_TYPES: frozenset[str] = frozenset({
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
})

# Status transitions allowed by the host. Backwards transitions are disallowed
# so an "active" lease can't be flipped back to "draft" without a tech reset.
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"draft", "generated"},
    "generated": {"generated", "sent", "signed"},
    "sent": {"sent", "signed"},
    "signed": {"signed", "active"},
    "active": {"active", "ended", "terminated"},
    "ended": {"ended"},
    "terminated": {"terminated"},
}


def _validate_status_transition(current: str, target: str) -> None:
    if target == current:
        return
    if target not in SIGNED_LEASE_STATUSES:
        raise InvalidStatusTransitionError(f"Unknown status: {target}")
    if target not in _ALLOWED_TRANSITIONS.get(current, {current}):
        raise InvalidStatusTransitionError(
            f"Cannot move from '{current}' to '{target}'"
        )


def _build_summary(lease) -> SignedLeaseSummary:
    return SignedLeaseSummary.model_validate(lease)


def _attachment_responses(rows) -> list[SignedLeaseAttachmentResponse]:
    return attach_presigned_urls_to_attachments(
        [SignedLeaseAttachmentResponse.model_validate(r) for r in rows],
    )


def _to_detail(lease, attachments) -> SignedLeaseResponse:
    return SignedLeaseResponse(
        id=lease.id,
        user_id=lease.user_id,
        organization_id=lease.organization_id,
        template_id=lease.template_id,
        applicant_id=lease.applicant_id,
        listing_id=lease.listing_id,
        values=dict(lease.values or {}),
        status=lease.status,
        starts_on=lease.starts_on,
        ends_on=lease.ends_on,
        notes=lease.notes,
        generated_at=lease.generated_at,
        sent_at=lease.sent_at,
        signed_at=lease.signed_at,
        ended_at=lease.ended_at,
        created_at=lease.created_at,
        updated_at=lease.updated_at,
        attachments=_attachment_responses(attachments),
    )


def _denormalise_dates(values: dict[str, Any]) -> tuple[_dt.date | None, _dt.date | None]:
    """Pull ``starts_on`` and ``ends_on`` from a values dict if present."""
    def _coerce(v: Any) -> _dt.date | None:
        if v is None:
            return None
        if isinstance(v, _dt.date) and not isinstance(v, _dt.datetime):
            return v
        if isinstance(v, str):
            try:
                return _dt.date.fromisoformat(v)
            except ValueError:
                return None
        return None

    candidates_start = ("MOVE-IN DATE", "MOVE_IN_DATE", "MOVE IN DATE")
    candidates_end = ("MOVE-OUT DATE", "MOVE_OUT_DATE", "MOVE OUT DATE")
    starts = next((_coerce(values[k]) for k in candidates_start if k in values), None)
    ends = next((_coerce(values[k]) for k in candidates_end if k in values), None)
    return starts, ends


# ---------------------------------------------------------------------------
# Create a draft lease
# ---------------------------------------------------------------------------

async def create_lease(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    template_id: uuid.UUID,
    applicant_id: uuid.UUID,
    listing_id: uuid.UUID | None,
    values: dict[str, Any],
) -> SignedLeaseResponse:
    """Create a draft signed lease. Validates required placeholders are present."""
    async with unit_of_work() as db:
        template = await lease_template_repo.get(
            db,
            template_id=template_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if template is None:
            raise TemplateNotFoundError(f"Template {template_id} not found")

        placeholders = await lease_template_placeholder_repo.list_for_template(
            db, template_id=template_id,
        )

        # Validate required placeholders.
        missing: list[str] = []
        for p in placeholders:
            if not p.required:
                continue
            if p.input_type == "computed":
                continue
            if p.input_type == "signature":
                # Filled at signing time, not now.
                continue
            if values.get(p.key) in (None, ""):
                missing.append(p.key)
        if missing:
            raise MissingRequiredValuesError(
                f"Missing required values: {', '.join(missing)}"
            )

        starts, ends = _denormalise_dates(values)

        lease = await signed_lease_repo.create(
            db,
            user_id=user_id,
            organization_id=organization_id,
            template_id=template_id,
            applicant_id=applicant_id,
            listing_id=listing_id,
            values=values,
            starts_on=starts,
            ends_on=ends,
            status="draft",
        )
        attachments = await signed_lease_attachment_repo.list_by_lease(db, lease.id)
    return _to_detail(lease, attachments)


# ---------------------------------------------------------------------------
# List + get
# ---------------------------------------------------------------------------

async def list_leases(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    applicant_id: uuid.UUID | None = None,
    listing_id: uuid.UUID | None = None,
    status: str | None = None,
    starts_after: _dt.date | None = None,
    starts_before: _dt.date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> SignedLeaseListResponse:
    async with unit_of_work() as db:
        rows = await signed_lease_repo.list_for_tenant(
            db,
            user_id=user_id,
            organization_id=organization_id,
            applicant_id=applicant_id,
            listing_id=listing_id,
            status=status,
            starts_after=starts_after,
            starts_before=starts_before,
            limit=limit,
            offset=offset,
        )
        total = await signed_lease_repo.count_for_tenant(
            db,
            user_id=user_id,
            organization_id=organization_id,
            applicant_id=applicant_id,
            listing_id=listing_id,
            status=status,
        )
    items = [_build_summary(r) for r in rows]
    return SignedLeaseListResponse(
        items=items, total=total, has_more=(offset + len(items)) < total,
    )


async def get_lease(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
) -> SignedLeaseResponse:
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
        attachments = await signed_lease_attachment_repo.list_by_lease(
            db, lease.id,
        )
    return _to_detail(lease, attachments)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

async def update_lease(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
    notes: str | None,
    status: str | None,
    values: dict[str, Any] | None,
) -> SignedLeaseResponse:
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")

        fields: dict[str, Any] = {}
        if notes is not None:
            fields["notes"] = notes

        if status is not None:
            _validate_status_transition(lease.status, status)
            fields["status"] = status
            now = _dt.datetime.now(_dt.timezone.utc)
            if status == "sent" and lease.sent_at is None:
                fields["sent_at"] = now
            if status == "signed" and lease.signed_at is None:
                fields["signed_at"] = now
            if status in ("ended", "terminated") and lease.ended_at is None:
                fields["ended_at"] = now

        if values is not None:
            if lease.status != "draft":
                raise CannotEditValuesError(
                    "Values can only be edited while the lease is a draft",
                )
            fields["values"] = values
            starts, ends = _denormalise_dates(values)
            fields["starts_on"] = starts
            fields["ends_on"] = ends

        if fields:
            await signed_lease_repo.update_lease(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                fields=fields,
            )

        attachments = await signed_lease_attachment_repo.list_by_lease(
            db, lease_id,
        )
        # Re-load lease so we return updated values.
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
    return _to_detail(lease, attachments)


# ---------------------------------------------------------------------------
# Generate (renders the template files into MinIO + creates attachments)
# ---------------------------------------------------------------------------

async def generate_lease(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
) -> SignedLeaseResponse:
    storage = get_storage()
    if storage is None:
        raise StorageNotConfiguredError("Object storage is not configured")

    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")

        files = await lease_template_file_repo.list_for_template(
            db, template_id=lease.template_id,
        )
        placeholders = await lease_template_placeholder_repo.list_for_template(
            db, template_id=lease.template_id,
        )

    # Build the substitution dict — start from raw values, then evaluate
    # computed placeholders (which can reference other keys).
    substitutions: dict[str, str] = {}
    for key, value in (lease.values or {}).items():
        substitutions[key] = "" if value is None else str(value)
    for p in placeholders:
        if p.input_type == "computed" and p.computed_expr:
            try:
                substitutions[p.key] = evaluate(p.computed_expr, lease.values or {})
            except ComputedExprError as exc:
                logger.warning(
                    "Computed placeholder %s failed to evaluate: %s", p.key, exc,
                )
                substitutions[p.key] = ""

    # Render each file and upload.
    uploaded: list[tuple[str, str, str, int]] = []  # (storage_key, filename, content_type, size)
    try:
        for f in files:
            raw = storage.download_file(f.storage_key)
            if f.content_type == DOCX_MIME:
                rendered_bytes, used_docx = render_docx_bytes(raw, substitutions)
                if used_docx:
                    out_filename = _ensure_suffix(f.filename, ".docx")
                    out_ct = DOCX_MIME
                else:
                    # Fall back to a markdown render of an empty body — log as
                    # a Phase 1.5 limitation (DOCX rendering disabled).
                    text = raw.decode("utf-8", errors="replace")
                    rendered_bytes = render_md(text, substitutions).encode("utf-8")
                    out_filename = _ensure_suffix(f.filename, ".md")
                    out_ct = "text/markdown"
            elif f.content_type in ("text/markdown", "text/plain"):
                text = raw.decode("utf-8", errors="replace")
                rendered_md_text = render_md(text, substitutions)
                rendered_bytes = render_md_text_to_pdf_or_keep(rendered_md_text)
                out_filename = _swap_extension(f.filename, ".pdf")
                out_ct = "application/pdf"
            else:
                # Pass-through (defensive — upload allowlist shouldn't allow
                # other content types).
                rendered_bytes = raw
                out_filename = f.filename
                out_ct = f.content_type

            attachment_id = uuid.uuid4()
            storage_key = f"signed-leases/{lease_id}/{attachment_id}"
            storage.upload_file(storage_key, rendered_bytes, out_ct)
            uploaded.append((storage_key, out_filename, out_ct, len(rendered_bytes)))

        # Persist attachment rows + transition lease to "generated".
        async with unit_of_work() as db:
            now = _dt.datetime.now(_dt.timezone.utc)
            for storage_key, out_filename, out_ct, size in uploaded:
                await signed_lease_attachment_repo.create(
                    db,
                    lease_id=lease_id,
                    storage_key=storage_key,
                    filename=out_filename,
                    content_type=out_ct,
                    size_bytes=size,
                    kind="rendered_original",
                    uploaded_by_user_id=user_id,
                    uploaded_at=now,
                )
            await signed_lease_repo.update_lease(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                fields={"status": "generated", "generated_at": now},
            )
    except Exception:
        # Best-effort cleanup of just-uploaded objects on failure.
        for storage_key, *_ in uploaded:
            try:
                storage.delete_file(storage_key)
            except Exception:  # noqa: BLE001
                logger.warning("Failed to clean up rendered file %s", storage_key)
        raise

    return await get_lease(
        user_id=user_id,
        organization_id=organization_id,
        lease_id=lease_id,
    )


def render_md_text_to_pdf_or_keep(rendered_md: str) -> bytes:
    """Render rendered markdown to PDF bytes (low-fidelity, reportlab-based)."""
    return render_pdf_from_text(rendered_md)


def _ensure_suffix(filename: str, suffix: str) -> str:
    if filename.lower().endswith(suffix):
        return filename
    base = filename.rsplit(".", 1)[0] if "." in filename else filename
    return f"{base}{suffix}"


def _swap_extension(filename: str, suffix: str) -> str:
    base = filename.rsplit(".", 1)[0] if "." in filename else filename
    return f"{base}{suffix}"


# ---------------------------------------------------------------------------
# Soft-delete
# ---------------------------------------------------------------------------

async def soft_delete_lease(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
        await signed_lease_repo.soft_delete(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

async def upload_attachment(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
    content: bytes,
    filename: str,
    declared_content_type: str | None,
    kind: str,
) -> SignedLeaseAttachmentResponse:
    storage = get_storage()
    if storage is None:
        raise StorageNotConfiguredError("Object storage is not configured")

    from app.core.config import settings as _settings
    from app.core.lease_enums import LEASE_ATTACHMENT_KINDS

    if kind not in LEASE_ATTACHMENT_KINDS:
        raise AttachmentTypeRejectedError(f"Invalid kind: {kind}")

    # Tenant scope.
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")

    if len(content) > _settings.max_blackout_attachment_size_bytes:
        max_mb = _settings.max_blackout_attachment_size_bytes // (1024 * 1024)
        raise AttachmentTooLargeError(f"File exceeds {max_mb}MB limit")

    # Resolve content type — fall back to extension when octet-stream.
    if declared_content_type and declared_content_type in ALLOWED_ATTACHMENT_MIME_TYPES:
        ct = declared_content_type
    else:
        lower = filename.lower()
        if lower.endswith(".pdf"):
            ct = "application/pdf"
        elif lower.endswith(".docx"):
            ct = DOCX_MIME
        elif lower.endswith(".jpg") or lower.endswith(".jpeg"):
            ct = "image/jpeg"
        elif lower.endswith(".png"):
            ct = "image/png"
        elif lower.endswith(".webp"):
            ct = "image/webp"
        else:
            raise AttachmentTypeRejectedError(
                f"Unsupported attachment type. Allowed: pdf, docx, jpg, png, webp",
            )
    if ct not in ALLOWED_ATTACHMENT_MIME_TYPES:
        raise AttachmentTypeRejectedError(
            f"Unsupported attachment type ({ct}). Allowed: pdf, docx, jpg, png, webp",
        )

    attachment_id = uuid.uuid4()
    storage_key = f"signed-leases/{lease_id}/{attachment_id}"
    storage.upload_file(storage_key, content, ct)

    try:
        async with unit_of_work() as db:
            row = await signed_lease_attachment_repo.create(
                db,
                lease_id=lease_id,
                storage_key=storage_key,
                filename=filename or f"attachment-{attachment_id.hex}",
                content_type=ct,
                size_bytes=len(content),
                kind=kind,
                uploaded_by_user_id=user_id,
                uploaded_at=_dt.datetime.now(_dt.timezone.utc),
            )
            response = SignedLeaseAttachmentResponse.model_validate(row)
    except Exception:
        try:
            storage.delete_file(storage_key)
        except Exception:  # noqa: BLE001
            logger.warning("Failed to clean up orphan lease attachment %s", storage_key)
        raise

    return attach_presigned_urls_to_attachments([response])[0]


async def list_attachments(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
) -> list[SignedLeaseAttachmentResponse]:
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
        rows = await signed_lease_attachment_repo.list_by_lease(db, lease_id)
    return _attachment_responses(rows)


async def delete_attachment(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
    attachment_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
        deleted = await signed_lease_attachment_repo.delete_by_id_scoped_to_lease(
            db, attachment_id, lease_id,
        )
        if deleted is None:
            raise AttachmentNotFoundError(f"Attachment {attachment_id} not found")
        storage_key = deleted.storage_key

    storage = get_storage()
    if storage is not None:
        try:
            storage.delete_file(storage_key)
        except Exception:  # noqa: BLE001
            logger.warning(
                "Failed to delete lease attachment object %s",
                storage_key, exc_info=True,
            )
