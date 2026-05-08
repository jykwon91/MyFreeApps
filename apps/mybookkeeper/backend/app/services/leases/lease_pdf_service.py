"""PDF generation service for signed leases.

Handles template rendering → MinIO upload → attachment row creation.
Covers ``generate_lease`` and ``add_templates_and_generate``.
Placeholder pre-fill lives in ``lease_prefill_service``.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from typing import Any

from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_placeholder_repo,
    lease_template_repo,
    signed_lease_attachment_repo,
    signed_lease_repo,
    signed_lease_template_repo,
)
from app.schemas.leases.signed_lease_response import SignedLeaseResponse
from app.services.leases._lease_helpers import (
    SignedLeaseNotFoundError,
    StorageNotConfiguredError,
    _denormalise_dates,
    _load_resolution_context,
)
from app.services.leases.computed import ComputedExprError, evaluate
from app.services.leases.default_source_resolver import resolve_default_source
from app.services.leases.lease_lifecycle_service import get_lease
from app.services.leases.lease_template_service import (
    DOCX_MIME,
    TemplateNotFoundError,
)
from app.services.leases.renderer import (
    render_docx_bytes_to_pdf,
    render_md,
    render_pdf_from_text,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions specific to PDF generation
# ---------------------------------------------------------------------------

class TemplatesAlreadyLinkedError(ValueError):
    """One or more template_ids are already linked to this lease."""

    def __init__(self, duplicate_ids: list[uuid.UUID]) -> None:
        self.duplicate_ids = duplicate_ids
        super().__init__(f"Templates already linked: {duplicate_ids}")


class ImportedLeaseTemplateError(ValueError):
    """Cannot add templates to an imported lease."""


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _swap_extension(filename: str, suffix: str) -> str:
    base = filename.rsplit(".", 1)[0] if "." in filename else filename
    return f"{base}{suffix}"


def render_md_text_to_pdf_or_keep(rendered_md: str) -> bytes:
    """Render rendered markdown to PDF bytes (low-fidelity, reportlab-based)."""
    return render_pdf_from_text(rendered_md)


# ---------------------------------------------------------------------------
# Auto-email gate predicate
# ---------------------------------------------------------------------------

def should_auto_email_after_generate(
    *, previous_status: str, auto_email_tenant: bool, last_emailed_to_tenant_at,
) -> bool:
    """Pure predicate: should the tenant auto-email fire after generate?

    The four gates that must all be TRUE:

    1. ``previous_status != "generated"`` — Regenerate of an
       already-generated lease must not re-email.
    2. ``auto_email_tenant`` — host hasn't opted this lease out of the
       feature.
    3. ``last_emailed_to_tenant_at`` is NULL — defensive: even if some
       prior path sent a tenant email, don't auto-send again.

    The applicant-has-contact_email check is enforced inside
    ``lease_email_service.send_lease_to_tenant``.
    """
    if previous_status == "generated":
        return False
    if not auto_email_tenant:
        return False
    if last_emailed_to_tenant_at is not None:
        return False
    return True


# ---------------------------------------------------------------------------
# Generate (renders all template files → MinIO + creates attachments)
# ---------------------------------------------------------------------------

async def generate_lease(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
) -> tuple[SignedLeaseResponse, bool]:
    """Render the lease and transition status to ``generated``.

    Returns a tuple of ``(detail, should_auto_email)``. The boolean
    flag is the auto-email gate decision computed BEFORE the status
    transition (so a Regenerate is correctly identified as
    ``previous_status="generated"`` and returns False).

    The route handler is responsible for scheduling the auto-email
    background task; this service stays I/O-pure on the SMTP side.
    """
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
        previous_status = lease.status
        auto_email_tenant = lease.auto_email_tenant
        last_emailed_to_tenant_at = lease.last_emailed_to_tenant_at

        join_rows = await signed_lease_template_repo.list_for_lease(
            db, lease_id=lease_id,
        )
        files: list = []
        placeholders: list = []
        seen_placeholder_keys: set[str] = set()
        for jr in join_rows:
            tpl_files = await lease_template_file_repo.list_for_template(
                db, template_id=jr.template_id,
            )
            files.extend(tpl_files)
            tpl_placeholders = await lease_template_placeholder_repo.list_for_template(
                db, template_id=jr.template_id,
            )
            for p in tpl_placeholders:
                if p.key not in seen_placeholder_keys:
                    seen_placeholder_keys.add(p.key)
                    placeholders.append(p)

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

    uploaded: list[tuple[str, str, str, int]] = []
    try:
        for f in files:
            raw = storage.download_file(f.storage_key)
            if f.content_type == DOCX_MIME:
                rendered_bytes, _ = render_docx_bytes_to_pdf(raw, substitutions)
                out_filename = _swap_extension(f.filename, ".pdf")
                out_ct = "application/pdf"
            elif f.content_type in ("text/markdown", "text/plain"):
                text = raw.decode("utf-8", errors="replace")
                rendered_md_text = render_md(text, substitutions)
                rendered_bytes = render_md_text_to_pdf_or_keep(rendered_md_text)
                out_filename = _swap_extension(f.filename, ".pdf")
                out_ct = "application/pdf"
            else:
                rendered_bytes = raw
                out_filename = f.filename
                out_ct = f.content_type

            attachment_id = uuid.uuid4()
            storage_key = f"signed-leases/{lease_id}/{attachment_id}"
            storage.upload_file(storage_key, rendered_bytes, out_ct)
            uploaded.append((storage_key, out_filename, out_ct, len(rendered_bytes)))

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
        for storage_key, *_ in uploaded:
            try:
                storage.delete_file(storage_key)
            except Exception:  # noqa: BLE001
                logger.warning("Failed to clean up rendered file %s", storage_key)
        raise

    detail = await get_lease(
        user_id=user_id,
        organization_id=organization_id,
        lease_id=lease_id,
    )
    should_auto_email = should_auto_email_after_generate(
        previous_status=previous_status,
        auto_email_tenant=auto_email_tenant,
        last_emailed_to_tenant_at=last_emailed_to_tenant_at,
    )
    return detail, should_auto_email


# ---------------------------------------------------------------------------
# Add templates to existing lease + render only the new files
# ---------------------------------------------------------------------------

async def add_templates_and_generate(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    lease_id: uuid.UUID,
    template_ids: list[uuid.UUID],
    values_override: dict[str, str] | None = None,
) -> SignedLeaseResponse:
    """Link additional templates to an existing lease and render only their files.

    Validates:
    - All ``template_ids`` exist and belong to the same org as the lease.
    - None are already linked to the lease (returns the duplicates in the error).

    Both generated and imported leases are supported. For imported leases
    ``lease.values`` is empty by construction (the original was uploaded as a
    PDF) — the caller may pass ``values_override`` to provide values for the
    addendum's placeholders, and the resolver will additionally pre-fill any
    placeholder whose ``default_source`` resolves against the parent lease,
    its applicant, the linked property, or the host user.

    Partial success: if one template's render fails the DB row and MinIO
    objects for that template are rolled back; others succeed.
    """
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

        for tid in template_ids:
            template = await lease_template_repo.get(
                db,
                template_id=tid,
                user_id=user_id,
                organization_id=organization_id,
            )
            if template is None:
                raise TemplateNotFoundError(f"Template {tid} not found")

        existing_rows = await signed_lease_template_repo.list_for_lease(
            db, lease_id=lease_id,
        )
        existing_ids = {r.template_id for r in existing_rows}
        new_template_ids = [tid for tid in template_ids if tid not in existing_ids]
        is_regenerate = any(tid in existing_ids for tid in template_ids)

        max_order = await signed_lease_template_repo.max_display_order_for_lease(
            db, lease_id=lease_id,
        )

        files_to_render: list = []
        placeholders: list = []
        seen_placeholder_keys: set[str] = set()
        seen_file_template_ids: set[uuid.UUID] = set()

        for r in existing_rows:
            for p in await lease_template_placeholder_repo.list_for_template(
                db, template_id=r.template_id,
            ):
                if p.key not in seen_placeholder_keys:
                    seen_placeholder_keys.add(p.key)
                    placeholders.append(p)
            if is_regenerate and r.template_id not in seen_file_template_ids:
                seen_file_template_ids.add(r.template_id)
                tpl_files = await lease_template_file_repo.list_for_template(
                    db, template_id=r.template_id,
                )
                for f in tpl_files:
                    files_to_render.append((f, r.template_id))

        for tid in template_ids:
            if tid not in seen_file_template_ids:
                seen_file_template_ids.add(tid)
                tpl_files = await lease_template_file_repo.list_for_template(
                    db, template_id=tid,
                )
                for f in tpl_files:
                    files_to_render.append((f, tid))
            for p in await lease_template_placeholder_repo.list_for_template(
                db, template_id=tid,
            ):
                if p.key not in seen_placeholder_keys:
                    seen_placeholder_keys.add(p.key)
                    placeholders.append(p)

        applicant, inquiry, property_record, user_record = (
            await _load_resolution_context(
                db,
                lease=lease,
                organization_id=organization_id,
                user_id=user_id,
            )
        )

        merged_values: dict[str, str] = {
            k: ("" if v is None else str(v))
            for k, v in (lease.values or {}).items()
        }
        for p in placeholders:
            existing = merged_values.get(p.key)
            if existing not in (None, ""):
                continue
            if not p.default_source:
                continue
            try:
                resolved, _ = resolve_default_source(
                    p.default_source,
                    applicant,
                    inquiry,
                    lease=lease,
                    property_record=property_record,
                    user_record=user_record,
                )
            except (ValueError, AttributeError):
                logger.warning(
                    "default_source resolution failed for placeholder %s on lease %s",
                    p.key, lease_id, exc_info=True,
                )
                continue
            if resolved is not None and resolved != "":
                merged_values[p.key] = str(resolved)

        if values_override:
            for k, v in values_override.items():
                if v is None:
                    continue
                merged_values[k] = str(v)

        if merged_values != (lease.values or {}):
            new_start, new_end = _denormalise_dates(merged_values)
            fields_to_update: dict[str, Any] = {"values": merged_values}
            if new_start is not None and lease.starts_on is None:
                fields_to_update["starts_on"] = new_start
            if new_end is not None and lease.ends_on is None:
                fields_to_update["ends_on"] = new_end
            await signed_lease_repo.update_lease(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                fields=fields_to_update,
            )

        for order_offset, tid in enumerate(new_template_ids):
            await signed_lease_template_repo.create(
                db,
                lease_id=lease_id,
                template_id=tid,
                display_order=max_order + 1 + order_offset,
            )

        rendered_keys_to_delete: list[str] = []
        if is_regenerate:
            existing_attachments = await signed_lease_attachment_repo.list_by_lease(
                db, lease_id,
            )
            for att in existing_attachments:
                if att.kind == "rendered_original":
                    rendered_keys_to_delete.append(att.storage_key)
                    await signed_lease_attachment_repo.delete_by_id_scoped_to_lease(
                        db,
                        attachment_id=att.id,
                        lease_id=lease_id,
                    )

        values_snapshot = dict(merged_values)

    for key in rendered_keys_to_delete:
        try:
            storage.delete_file(key)
        except Exception:  # noqa: BLE001
            logger.warning(
                "Failed to delete superseded rendered file %s on regenerate",
                key, exc_info=True,
            )

    substitutions: dict[str, str] = {
        k: "" if v is None else str(v) for k, v in values_snapshot.items()
    }
    for p in placeholders:
        if p.input_type == "computed" and p.computed_expr:
            try:
                substitutions[p.key] = evaluate(p.computed_expr, values_snapshot)
            except ComputedExprError as exc:
                logger.warning(
                    "Computed placeholder %s failed to evaluate: %s", p.key, exc,
                )
                substitutions[p.key] = ""

    now = _dt.datetime.now(_dt.timezone.utc)
    for f, tid in files_to_render:
        uploaded_key: str | None = None
        try:
            raw = storage.download_file(f.storage_key)
            if f.content_type == DOCX_MIME:
                rendered_bytes, _ = render_docx_bytes_to_pdf(raw, substitutions)
                out_filename = _swap_extension(f.filename, ".pdf")
                out_ct = "application/pdf"
            elif f.content_type in ("text/markdown", "text/plain"):
                text = raw.decode("utf-8", errors="replace")
                rendered_md_text = render_md(text, substitutions)
                rendered_bytes = render_md_text_to_pdf_or_keep(rendered_md_text)
                out_filename = _swap_extension(f.filename, ".pdf")
                out_ct = "application/pdf"
            else:
                rendered_bytes = raw
                out_filename = f.filename
                out_ct = f.content_type

            attachment_id = uuid.uuid4()
            storage_key = f"signed-leases/{lease_id}/{attachment_id}"
            storage.upload_file(storage_key, rendered_bytes, out_ct)
            uploaded_key = storage_key

            async with unit_of_work() as db:
                await signed_lease_attachment_repo.create(
                    db,
                    lease_id=lease_id,
                    storage_key=storage_key,
                    filename=out_filename,
                    content_type=out_ct,
                    size_bytes=len(rendered_bytes),
                    kind="rendered_original",
                    uploaded_by_user_id=user_id,
                    uploaded_at=now,
                )
        except Exception:  # noqa: BLE001
            logger.error(
                "Failed to render/upload file %s for template %s on lease %s",
                f.filename,
                tid,
                lease_id,
                exc_info=True,
            )
            if uploaded_key is not None:
                try:
                    storage.delete_file(uploaded_key)
                except Exception:  # noqa: BLE001
                    logger.warning(
                        "Failed to clean up partially-uploaded file %s", uploaded_key,
                    )

    return await get_lease(
        user_id=user_id,
        organization_id=organization_id,
        lease_id=lease_id,
    )
