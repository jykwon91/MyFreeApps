"""Service: render a welcome manual to PDF and email it to a guest.

Orchestration only (load → decide → fetch attachment bytes → send → record).
Mirrors ``app.services.leases.lease_email_service.send_lease_to_tenant``:

- Load the manual org-scoped (404 if missing / other org).
- Resolve the HOST's own login email (``users.email`` of ``manual.user_id``)
  to use as the outgoing ``Reply-To`` so guest replies reach the host.
- If SMTP isn't configured → record a ``skipped`` send row and return it (never
  raise — mirrors lease skip semantics).
- Fetch each section image's bytes from storage. On a storage outage the PDF is
  rendered TEXT-ONLY (per CLAUDE.md "reads must never crash on a storage
  outage"); an individual image download failure skips just that image.
- Send the PDF as an attachment; record ``sent`` on success, ``failed`` on a
  False return.

The endpoint returns the send record (HTTP 200) even on failure/skip — the
``status`` field communicates the outcome so the frontend shows a clear
message rather than a network error.

``build_subject`` / ``build_body_html`` are pure helpers exposed for unit tests.
"""
from __future__ import annotations

import html as html_mod
import logging
import re
import uuid

from app.core.storage import StorageNotConfiguredError, get_storage
from app.db.session import unit_of_work
from app.repositories import (
    user_repo,
    welcome_manual_repo,
    welcome_manual_section_field_repo,
    welcome_manual_section_image_repo,
    welcome_manual_section_repo,
    welcome_manual_send_repo,
)
from app.schemas.welcome_manuals.welcome_manual_send_response import (
    WelcomeManualSendResponse,
)
from app.services.system import email_service
from app.services.system.email_service import EmailAttachment
from app.services.welcome_manuals.welcome_manual_pdf_service import (
    SectionFieldPdfData,
    SectionImagePdfData,
    SectionPdfData,
    WelcomeManualPdfData,
    generate_welcome_manual_pdf,
)

logger = logging.getLogger(__name__)

_SLUG_RE = re.compile(r"[^a-z0-9]+")


class ManualNotFoundError(LookupError):
    """The manual doesn't exist, is soft-deleted, or belongs to another org."""


def build_subject(*, manual_title: str) -> str:
    """Pure helper. Subject line for the guest email."""
    title = manual_title.strip() if manual_title else ""
    if title:
        return f"Your welcome guide — {title}"
    return "Your welcome guide"


def build_body_html(*, manual_title: str, recipient_name: str | None) -> str:
    """Pure helper. Minimal HTML cover note. All interpolated values are
    HTML-escaped to prevent injection via host-authored / free-typed text."""
    greeting_name = recipient_name.strip() if recipient_name else ""
    greeting = (
        f"Hi {html_mod.escape(greeting_name)},"
        if greeting_name
        else "Hi there,"
    )
    safe_title = html_mod.escape(manual_title) if manual_title else "your stay"
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto;">
      <div style="border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #111827;">Your welcome guide is attached</h2>
        <p style="margin: 0 0 12px 0; font-size: 15px; color: #374151;">{greeting}</p>
        <p style="margin: 0 0 12px 0; font-size: 15px; color: #374151;">
          Attached is the welcome guide for <strong>{safe_title}</strong> — it
          has everything you need for your stay. Just reply to this email if you
          have any questions.
        </p>
        <p style="margin: 16px 0 0 0; font-size: 13px; color: #6b7280;">
          Sent via MyBookkeeper on behalf of your host.
        </p>
      </div>
    </div>
    """


def _filename(manual_title: str) -> str:
    """Derive a tasteful PDF download filename from the manual title."""
    slug = _SLUG_RE.sub("-", (manual_title or "").lower()).strip("-")
    return f"{slug or 'welcome-guide'}.pdf"


def _fetch_image_bytes(images, *, manual_id: uuid.UUID) -> dict[uuid.UUID, bytes]:
    """Download each section image's bytes from storage, keyed by image id.

    On a storage outage (``StorageNotConfiguredError``) returns an empty map so
    the PDF renders text-only. An individual download failure skips just that
    image (logged) — a missing photo must not block the whole guide.
    """
    if not images:
        return {}
    try:
        storage = get_storage()
    except StorageNotConfiguredError:
        logger.warning(
            "welcome_manual_email.storage_unavailable manual_id=%s — "
            "rendering PDF text-only",
            manual_id,
        )
        return {}

    by_image: dict[uuid.UUID, bytes] = {}
    for image in images:
        try:
            by_image[image.id] = storage.download_file(image.storage_key)
        except Exception:  # noqa: BLE001 — skip just this image
            logger.warning(
                "welcome_manual_email.image_fetch_failed manual_id=%s storage_key=%s",
                manual_id, image.storage_key, exc_info=True,
            )
    return by_image


def _build_pdf_data(manual, sections, images, fields, image_bytes) -> WelcomeManualPdfData:
    """Assemble the pure PDF data carrier from the loaded ORM rows + bytes."""
    images_by_section: dict[uuid.UUID, list[SectionImagePdfData]] = {}
    for image in images:
        content = image_bytes.get(image.id)
        if content is None:
            continue
        images_by_section.setdefault(image.section_id, []).append(
            SectionImagePdfData(image_bytes=content, caption=image.caption),
        )
    fields_by_section: dict[uuid.UUID, list[SectionFieldPdfData]] = {}
    for field in fields:
        fields_by_section.setdefault(field.section_id, []).append(
            SectionFieldPdfData(label=field.label, value=field.value),
        )
    section_data = [
        SectionPdfData(
            title=section.title,
            body=section.body,
            fields=fields_by_section.get(section.id, []),
            images=images_by_section.get(section.id, []),
        )
        for section in sections
    ]
    return WelcomeManualPdfData(
        title=manual.title,
        intro_text=manual.intro_text,
        sections=section_data,
    )


async def send_manual_to_guest(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,  # noqa: ARG001 — accepted for audit context
    manual_id: uuid.UUID,
    recipient_email: str,
    recipient_name: str | None,
) -> WelcomeManualSendResponse:
    """Render ``manual_id`` to a PDF and email it to ``recipient_email``.

    Returns the recorded send (``status`` in {sent, failed, skipped}). Raises
    ManualNotFoundError if the manual isn't visible to the caller's org.
    """
    # Load manual + sections + images + host email in one short transaction.
    async with unit_of_work() as db:
        manual = await welcome_manual_repo.get_by_id(db, manual_id, organization_id)
        if manual is None:
            raise ManualNotFoundError(f"Welcome manual {manual_id} not found")
        sections = await welcome_manual_section_repo.list_by_manual(db, manual.id)
        section_ids = [s.id for s in sections]
        images = await welcome_manual_section_image_repo.list_by_section_ids(db, section_ids)
        fields = await welcome_manual_section_field_repo.list_by_section_ids(db, section_ids)
        host = await user_repo.get_by_id(db, manual.user_id)
        host_email = host.email if host is not None else None
        manual_title = manual.title

    if not email_service.is_configured():
        logger.info(
            "welcome_manual_email.skipped reason=smtp_not_configured manual_id=%s",
            manual_id,
        )
        return await _record_send(
            manual_id=manual_id,
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            status="skipped",
            error_reason="smtp_not_configured",
        )

    image_bytes = _fetch_image_bytes(images, manual_id=manual_id)
    pdf_bytes = generate_welcome_manual_pdf(
        _build_pdf_data(manual, sections, images, fields, image_bytes),
    )

    attachment = EmailAttachment(
        filename=_filename(manual_title),
        content=pdf_bytes,
        content_type="application/pdf",
    )
    sent = email_service.send_email(
        [recipient_email],
        build_subject(manual_title=manual_title),
        build_body_html(manual_title=manual_title, recipient_name=recipient_name),
        attachments=[attachment],
        reply_to=host_email,
    )

    if not sent:
        logger.warning(
            "welcome_manual_email.send_failed manual_id=%s", manual_id,
        )
        return await _record_send(
            manual_id=manual_id,
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            status="failed",
            error_reason="send_failed",
        )

    logger.info("welcome_manual_email.sent manual_id=%s", manual_id)
    return await _record_send(
        manual_id=manual_id,
        recipient_email=recipient_email,
        recipient_name=recipient_name,
        status="sent",
        error_reason=None,
    )


async def _record_send(
    *,
    manual_id: uuid.UUID,
    recipient_email: str,
    recipient_name: str | None,
    status: str,
    error_reason: str | None,
) -> WelcomeManualSendResponse:
    """Persist a send-log row in its own short transaction and return it."""
    async with unit_of_work() as db:
        send = await welcome_manual_send_repo.create(
            db,
            manual_id=manual_id,
            recipient_email=recipient_email,
            recipient_name=recipient_name,
            status=status,
            error_reason=error_reason,
        )
        return WelcomeManualSendResponse.model_validate(send)
