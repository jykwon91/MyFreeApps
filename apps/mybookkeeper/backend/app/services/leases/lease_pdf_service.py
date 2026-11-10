"""PDF generation service for signed leases.

Handles template rendering → MinIO upload → attachment row creation.
Covers ``generate_lease`` and ``add_templates_and_generate``.
Placeholder pre-fill lives in ``lease_prefill_service``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories.leases import (
    lease_template_file_repo,
    lease_template_placeholder_repo,
    lease_rendered_attachment_repo,
    lease_template_repo,
    signed_lease_repo,
    signed_lease_template_repo,
)
from app.schemas.leases.signed_lease_response import SignedLeaseResponse
from app.services.leases._lease_helpers import (
    SignedLeaseNotFoundError,
    _load_resolution_context,
)
from app.services.leases.lease_lifecycle_service import get_lease
from app.services.leases.lease_render_service import (
    attachments_present_check,
    build_substitutions,
    render_and_upload,
    render_md_text_to_pdf_or_keep,  # noqa: F401 — re-exported via signed_lease_service
)
from app.services.leases.lease_template_service import TemplateNotFoundError
from app.services.leases.lease_template_snapshot import (
    read_template_versions,
    record_rendered_templates,
)
from app.services.leases.lease_addendum_values import merge_addendum_values
from app.services.leases.lease_documents_lock import ensure_documents_rerenderable, lease_documents_locked
from app.services.leases.lease_write_precheck import lock_lease_and_verify
from app.services.storage.committed_write_guard import CommittedWriteGuard

# Exceptions specific to PDF generation

class ImportedLeaseTemplateError(ValueError):
    """Cannot add templates to an imported lease."""


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Auto-email gate predicate
# ---------------------------------------------------------------------------

def should_auto_email_after_generate(
    *, previous_status: str, auto_email_tenant: bool,
) -> bool:
    """Pure predicate: should the tenant auto-email fire after generate?

    The gates that must all be TRUE:

    1. ``previous_status != "generated"`` — Regenerate of an
       already-generated lease must not re-email.
    2. ``auto_email_tenant`` — host hasn't opted this lease out of the
       feature.

    A lease that has already been emailed never gets here: ``generate_lease``
    refuses to re-render it.

    The applicant-has-contact_email check is enforced inside
    ``lease_email_service.send_lease_to_tenant``.
    """
    if previous_status == "generated":
        return False
    if not auto_email_tenant:
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
    today: _dt.date,
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

    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
        await ensure_documents_rerenderable(db, lease)
        previous_status = lease.status
        auto_email_tenant = lease.auto_email_tenant

        join_rows = await signed_lease_template_repo.list_for_lease(
            db, lease_id=lease_id,
        )
        rendered_versions = await read_template_versions(
            db, template_ids=[jr.template_id for jr in join_rows],
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
        lease_values = dict(lease.values or {})
        read_starts_on, read_ends_on = lease.starts_on, lease.ends_on
        read_template_ids = {jr.template_id for jr in join_rows}

    # Generating again replaces the earlier rendered documents (as a regenerate
    # does) instead of piling up duplicates; they are removed only once the new
    # ones are committed.
    substitutions = build_substitutions(lease_values, placeholders, today)
    rendered = await render_and_upload(storage, lease_id, files, substitutions)
    keys = [r.storage_key for r in rendered]
    now = _dt.datetime.now(_dt.timezone.utc)
    check = attachments_present_check(lease_id, user_id, organization_id, keys)
    async with CommittedWriteGuard(keys, check) as guard:
        async with unit_of_work() as db:
            await lock_lease_and_verify(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                rendered_template_ids=read_template_ids,
                rendered_values=lease_values,
                rendered_starts_on=read_starts_on,
                rendered_ends_on=read_ends_on,
                rerenders_documents=True,
                locked_at_read=False,
            )
            superseded = await lease_rendered_attachment_repo.replace_rendered_original(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                files=rendered,
                replace_existing=True,
                uploaded_at=now,
            )
            if superseded is None:
                raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
            await signed_lease_repo.update_lease(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                fields={"status": "generated", "generated_at": now},
            )
            await record_rendered_templates(
                db, lease_id=lease_id, rendered_versions=rendered_versions,
            )
            guard.set_superseded(superseded)
            guard.rows_written()

    detail = await get_lease(
        user_id=user_id,
        organization_id=organization_id,
        lease_id=lease_id,
    )
    should_auto_email = should_auto_email_after_generate(
        previous_status=previous_status,
        auto_email_tenant=auto_email_tenant,
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
    today: _dt.date,
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

    All-or-nothing: every file is rendered and uploaded before anything is
    written; if any fails the request fails and the lease is left unchanged.
    Re-adding an already-linked template regenerates the lease's rendered
    documents, replacing the earlier ones in one transaction; once the lease is
    sent or signed that raises ``LeaseDocumentsLockedError``, while adding only
    new templates still renders just their files and leaves existing documents
    untouched. If the lease's
    templates, values or dates changed while rendering, nothing is written and
    ``LeaseChangedDuringRenderError`` is raised.
    """
    storage = get_storage()

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
        read_values = dict(lease.values or {})
        read_starts_on, read_ends_on = lease.starts_on, lease.ends_on
        new_template_ids = [tid for tid in template_ids if tid not in existing_ids]
        is_regenerate = any(tid in existing_ids for tid in template_ids)
        if is_regenerate:
            await ensure_documents_rerenderable(db, lease)
        rendered_versions = await read_template_versions(
            db,
            template_ids=([r.template_id for r in existing_rows] if is_regenerate else []) + template_ids,
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

        is_locked = await lease_documents_locked(db, lease)
        merged_values, fields_to_update = merge_addendum_values(
            lease=lease,
            placeholders=placeholders,
            override=values_override,
            applicant=applicant,
            inquiry=inquiry,
            property_record=property_record,
            user_record=user_record,
            today=today,
            is_locked=is_locked,
        )

    # Nothing is written until every file has rendered and uploaded, so a
    # failure (a template object that vanished, a render error) leaves the
    # lease exactly as it was: no half-linked templates, no lost documents.
    substitutions = build_substitutions(merged_values, placeholders, today)
    rendered = await render_and_upload(
        storage, lease_id, [f for f, _ in files_to_render], substitutions,
    )
    keys = [r.storage_key for r in rendered]
    now = _dt.datetime.now(_dt.timezone.utc)
    check = attachments_present_check(lease_id, user_id, organization_id, keys)
    async with CommittedWriteGuard(keys, check) as guard:
        async with unit_of_work() as db:
            # Lock order is always lease, then template. Nothing locks a template
            # and then a lease.
            await lock_lease_and_verify(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                rendered_template_ids=existing_ids,
                rendered_values=read_values,
                rendered_starts_on=read_starts_on,
                rendered_ends_on=read_ends_on,
                rerenders_documents=is_regenerate,
                locked_at_read=is_locked,
            )
            # A template soft-deleted since the read cannot be linked; templates
            # are locked in a fixed order so concurrent adds cannot deadlock.
            for tid in sorted(new_template_ids, key=str):
                locked_template = await lease_template_repo.get(
                    db,
                    template_id=tid,
                    user_id=user_id,
                    organization_id=organization_id,
                    for_update=True,
                )
                if locked_template is None:
                    raise TemplateNotFoundError(f"Template {tid} not found")
            superseded = await lease_rendered_attachment_repo.replace_rendered_original(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                files=rendered,
                replace_existing=is_regenerate,
                uploaded_at=now,
            )
            if superseded is None:
                raise SignedLeaseNotFoundError(f"Lease {lease_id} not found")
            max_order = await signed_lease_template_repo.max_display_order_for_lease(
                db, lease_id=lease_id,
            )
            for tid in new_template_ids:
                max_order += 1
                await signed_lease_template_repo.create(
                    db, lease_id=lease_id, template_id=tid, display_order=max_order,
                )
            await record_rendered_templates(
                db, lease_id=lease_id, rendered_versions=rendered_versions,
            )
            if fields_to_update:
                await signed_lease_repo.update_lease(
                    db,
                    lease_id=lease_id,
                    user_id=user_id,
                    organization_id=organization_id,
                    fields=fields_to_update,
                )
            guard.set_superseded(superseded)
            guard.rows_written()

    return await get_lease(
        user_id=user_id,
        organization_id=organization_id,
        lease_id=lease_id,
    )
