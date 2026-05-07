"""Service: email a rendered lease + attachments to the tenant.

Two callers:

1. ``signed_lease_service.generate_lease`` schedules ``send_lease_to_tenant``
   as a FastAPI ``BackgroundTask`` after a successful FIRST generate (i.e.
   the lease was not already in ``status='generated'`` and has not been
   auto-emailed before). The HTTP response from ``POST /generate`` returns
   immediately — email send never blocks.
2. ``POST /signed-leases/{id}/email-tenant`` calls ``send_lease_to_tenant``
   for manual re-send. The endpoint returns 202 ``{queued: true}`` and the
   send happens in the background. Manual re-send is ALWAYS allowed even
   if the lease has already been auto-emailed.

Skips (logged at WARNING / INFO, never raise):

* Applicant has no ``contact_email`` → INFO log + skip + record event
  ``lease_email_skipped`` so the operator can spot it on the timeline.
* SMTP isn't configured (dev/CI mode) → INFO log + skip + record event
  ``lease_email_skipped``. Mirrors the same shape MBK uses for
  ``send_inquiry_notification``.
* Storage isn't configured / a referenced attachment is missing →
  WARNING log + skip + record event. Generation already failed loudly
  if storage was missing at generate-time, so this case is defensive.

Pure-function helpers (``build_subject`` / ``build_body_html``) are
exposed so unit tests can exercise them without touching the database.
"""
from __future__ import annotations

import datetime as _dt
import html as html_mod
import logging
import uuid

from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.repositories.applicants import applicant_repo
from app.repositories.leases import (
    signed_lease_attachment_repo,
    signed_lease_repo,
)
from app.repositories.listings import listing_repo
from app.services.leases.lease_filename import friendly_download_filename
from app.services.system import email_service
from app.services.system.email_service import EmailAttachment
from app.services.system.event_service import record_event

logger = logging.getLogger(__name__)


# Attachment kinds we include in the tenant email. We deliberately
# include both the rendered originals (the freshly generated PDFs)
# and any signed_lease attachments the host may have uploaded after
# generation — the tenant should see whatever the host has marked as
# "this is the lease document", regardless of upload mechanism.
LEASE_EMAIL_ATTACHMENT_KINDS: frozenset[str] = frozenset({
    "rendered_original",
    "signed_lease",
})


def build_subject(*, applicant_legal_name: str | None) -> str:
    """Pure helper. Builds the email subject line.

    Falls back to "Your lease" when the applicant has no legal_name on
    file (defensive — the route requires a contact_email but doesn't
    require legal_name).
    """
    if applicant_legal_name:
        return f"Your lease — {applicant_legal_name}"
    return "Your lease"


def build_body_html(*, listing_title: str | None) -> str:
    """Pure helper. Builds the HTML body shown to the tenant.

    Intentionally minimal for the first version — the documents are
    attached; this is just the cover note. A signing flow is out of
    scope for this PR.
    """
    address_line = (
        f"<p style=\"margin: 0 0 12px 0; font-size: 15px; color: #374151;\">"
        f"This is the lease for <strong>{html_mod.escape(listing_title)}</strong>."
        f"</p>"
        if listing_title
        else ""
    )
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto;">
      <div style="border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #111827;">Your lease is ready</h2>
        {address_line}
        <p style="margin: 0 0 12px 0; font-size: 15px; color: #374151;">
          Please review the attached document(s) and reply to this email
          with any questions. We&rsquo;ll send signing instructions in a
          follow-up.
        </p>
        <p style="margin: 16px 0 0 0; font-size: 13px; color: #6b7280;">
          Sent automatically from MyBookkeeper on behalf of your host.
        </p>
      </div>
    </div>
    """


class ApplicantEmailMissingError(LookupError):
    """Raised by the manual-resend endpoint when the applicant has no
    contact_email on file. Distinguishes "the lease exists but we have
    nowhere to send" from "the lease doesn't exist" (404).
    """


class LeaseNotFoundError(LookupError):
    """Lease doesn't exist or isn't visible to the caller."""


async def assert_can_email_tenant(
    *,
    lease_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> None:
    """Validate that the lease exists and the applicant has a
    contact_email — used by the manual ``POST /email-tenant`` endpoint
    to fail fast before queueing a background task that would silently
    skip.

    Raises:
        LeaseNotFoundError: lease doesn't exist or isn't visible.
        ApplicantEmailMissingError: applicant has no contact_email.
    """
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            raise LeaseNotFoundError(f"Lease {lease_id} not found")
        applicant = await applicant_repo.get(
            db,
            applicant_id=lease.applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
    if applicant is None or not applicant.contact_email:
        raise ApplicantEmailMissingError(
            f"Applicant for lease {lease_id} has no contact_email",
        )


async def send_lease_to_tenant(
    *,
    lease_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    """Send the rendered lease attachments to the tenant.

    Returns True on a successful SMTP send, False on any skip (no
    email on file, SMTP unconfigured, no eligible attachments) or
    failure. Never raises — callers (background task + manual route)
    rely on best-effort semantics.

    On success, stamps ``signed_leases.last_emailed_to_tenant_at`` so
    the auto-email idempotency gate doesn't fire again on a Regenerate.
    Manual re-send also stamps this column — the column is "the most
    recent successful tenant email", not strictly "the first one".
    """
    # Load the lease + applicant + attachments in one short transaction.
    async with unit_of_work() as db:
        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if lease is None:
            logger.warning(
                "lease_email.lease_not_found lease_id=%s user_id=%s",
                lease_id, user_id,
            )
            return False

        applicant = await applicant_repo.get(
            db,
            applicant_id=lease.applicant_id,
            organization_id=organization_id,
            user_id=user_id,
        )
        if applicant is None:
            logger.warning(
                "lease_email.applicant_not_found lease_id=%s applicant_id=%s",
                lease_id, lease.applicant_id,
            )
            return False

        attachments = await signed_lease_attachment_repo.list_by_lease(db, lease_id)

        listing_title: str | None = None
        if lease.listing_id is not None:
            listing = await listing_repo.get_by_id(
                db, lease.listing_id, organization_id,
            )
            if listing is not None:
                listing_title = listing.title

        applicant_legal_name = applicant.legal_name
        contact_email = applicant.contact_email

    if not contact_email:
        logger.info(
            "lease_email.skipped reason=no_contact_email lease_id=%s",
            lease_id,
        )
        await record_event(
            organization_id,
            "lease_email_skipped",
            "info",
            "Tenant email skipped: applicant has no contact email on file.",
            {"lease_id": str(lease_id), "reason": "no_contact_email"},
        )
        return False

    if not email_service.is_configured():
        logger.info(
            "lease_email.skipped reason=smtp_not_configured lease_id=%s",
            lease_id,
        )
        await record_event(
            organization_id,
            "lease_email_skipped",
            "info",
            "Tenant email skipped: SMTP is not configured on this deploy.",
            {"lease_id": str(lease_id), "reason": "smtp_not_configured"},
        )
        return False

    eligible = [a for a in attachments if a.kind in LEASE_EMAIL_ATTACHMENT_KINDS]
    if not eligible:
        logger.warning(
            "lease_email.skipped reason=no_eligible_attachments lease_id=%s",
            lease_id,
        )
        await record_event(
            organization_id,
            "lease_email_skipped",
            "warning",
            "Tenant email skipped: no rendered or signed-lease attachments to send.",
            {"lease_id": str(lease_id), "reason": "no_eligible_attachments"},
        )
        return False

    # Fetch attachment bytes from MinIO. If any one fetch fails we skip
    # the whole send — partial attachments would be confusing for the
    # tenant ("where's page 2?"). Generation already validated storage
    # was reachable, so this path is defensive.
    storage = get_storage()
    if storage is None:
        logger.warning(
            "lease_email.skipped reason=storage_not_configured lease_id=%s",
            lease_id,
        )
        await record_event(
            organization_id,
            "lease_email_skipped",
            "warning",
            "Tenant email skipped: object storage is not configured.",
            {"lease_id": str(lease_id), "reason": "storage_not_configured"},
        )
        return False

    email_attachments: list[EmailAttachment] = []
    for a in eligible:
        try:
            content = storage.download_file(a.storage_key)
        except Exception:  # noqa: BLE001 — defensive; surface as a skip
            logger.warning(
                "lease_email.fetch_failed lease_id=%s storage_key=%s",
                lease_id, a.storage_key, exc_info=True,
            )
            await record_event(
                organization_id,
                "lease_email_skipped",
                "warning",
                "Tenant email skipped: could not fetch one of the attachments.",
                {
                    "lease_id": str(lease_id),
                    "reason": "attachment_fetch_failed",
                    "storage_key": a.storage_key,
                },
            )
            return False
        email_attachments.append(
            EmailAttachment(
                filename=friendly_download_filename(a),
                content=content,
                content_type=a.content_type,
            )
        )

    subject = build_subject(applicant_legal_name=applicant_legal_name)
    body_html = build_body_html(listing_title=listing_title)

    sent = email_service.send_email(
        [contact_email], subject, body_html, attachments=email_attachments,
    )
    if not sent:
        logger.warning(
            "lease_email.send_failed lease_id=%s recipient=%s",
            lease_id, _redact_email(contact_email),
        )
        await record_event(
            organization_id,
            "lease_email_failed",
            "warning",
            "Tenant email failed to send.",
            {"lease_id": str(lease_id)},
        )
        return False

    # Stamp last_emailed_to_tenant_at so a Regenerate doesn't auto-resend.
    # Use a short separate transaction so a stamp failure is logged but
    # doesn't unsend the email.
    try:
        async with unit_of_work() as db:
            await signed_lease_repo.update_lease(
                db,
                lease_id=lease_id,
                user_id=user_id,
                organization_id=organization_id,
                fields={
                    "last_emailed_to_tenant_at": _dt.datetime.now(_dt.timezone.utc),
                },
            )
    except Exception:
        logger.warning(
            "lease_email.stamp_failed lease_id=%s",
            lease_id, exc_info=True,
        )

    logger.info(
        "lease_email.sent lease_id=%s recipient=%s attachments=%d",
        lease_id, _redact_email(contact_email), len(email_attachments),
    )
    await record_event(
        organization_id,
        "lease_email_sent",
        "info",
        "Tenant email sent.",
        {
            "lease_id": str(lease_id),
            "attachment_count": len(email_attachments),
        },
    )
    return True


def _redact_email(value: str) -> str:
    """Redact the local-part of an email so logs don't leak PII.

    ``user@example.com`` → ``u***@example.com``. Defensive: returns
    ``***`` for malformed inputs so we never log the raw value.
    """
    if not value or "@" not in value:
        return "***"
    local, _, domain = value.partition("@")
    if not local:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"
