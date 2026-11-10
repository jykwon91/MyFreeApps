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

import html as html_mod
import logging
import uuid
from collections.abc import Callable
from typing import NamedTuple

from app.core.storage import get_storage
from app.db.session import unit_of_work
from app.models.leases.signed_lease_attachment import SignedLeaseAttachment
from app.repositories.applicants import applicant_repo
from app.repositories.demo import demo_repo
from app.repositories.leases import (
    signed_lease_attachment_repo,
    signed_lease_repo,
)
from app.repositories.listings import listing_repo
from app.schemas.leases.tenant_email_stamps import TenantEmailStamps
from app.services.leases.lease_email_stamp import restore_email_stamps, stamp_email_start
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


def build_extension_subject(*, applicant_legal_name: str | None) -> str:
    """Pure helper. Same fallback as ``build_subject``."""
    if applicant_legal_name:
        return f"Your lease extension — {applicant_legal_name}"
    return "Your lease extension"


def build_body_html(*, listing_title: str | None) -> str:
    """Pure helper. Builds the HTML body shown to the tenant.

    Intentionally minimal for the first version — the documents are
    attached; this is just the cover note. A signing flow is out of
    scope for this PR.
    """
    return _cover_note(
        heading="Your lease is ready",
        document="lease",
        listing_title=listing_title,
        request=(
            "Please review the attached document(s) and reply to this email\n"
            "          with any questions. We&rsquo;ll send signing instructions in a\n"
            "          follow-up."
        ),
    )


def build_extension_body_html(*, listing_title: str | None) -> str:
    """Pure helper. Cover note for an extension addendum."""
    return _cover_note(
        heading="Your lease has been extended",
        document="extension addendum",
        listing_title=listing_title,
        request=(
            "The addendum with the new end date is attached. Please review it\n"
            "          and reply to this email with any questions."
        ),
    )


def _cover_note(*, heading: str, document: str, listing_title: str | None, request: str) -> str:
    address_line = (
        f"<p style=\"margin: 0 0 12px 0; font-size: 15px; color: #374151;\">"
        f"This is the {document} for <strong>{html_mod.escape(listing_title)}</strong>."
        f"</p>"
        if listing_title
        else ""
    )
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto;">
      <div style="border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #111827;">{heading}</h2>
        {address_line}
        <p style="margin: 0 0 12px 0; font-size: 15px; color: #374151;">
          {request}
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


class DemoWorkspaceEmailError(Exception):
    """A demo workspace asked to email a tenant; it never sends real email."""


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
        DemoWorkspaceEmailError: a demo workspace never sends real email.
        LeaseNotFoundError: lease doesn't exist or isn't visible.
        ApplicantEmailMissingError: applicant has no contact_email.
    """
    async with unit_of_work() as db:
        if await demo_repo.is_demo_org(db, organization_id):
            raise DemoWorkspaceEmailError(f"Demo workspace {organization_id} can't email a tenant")
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
    failure of the send itself; a failure to stamp the lease raises, since
    nothing may go out that the lease does not know about.

    Under the lease row lock, in the transaction that reads the files to send,
    stamps ``signed_leases.last_emailed_to_tenant_at`` and each sent file's
    ``emailed_to_tenant_at``. That locks the lease's documents and those files
    (see ``lease_documents_lock``) and stops the auto-email gate firing again on
    a Regenerate. The lease column means "the most recent time a tenant email
    was started", so it stays set when the SMTP send fails (the documents may
    have gone out), and the host can always send again. If an attachment can't
    be fetched nothing was sent, so the stamps this email wrote are put back
    (see ``lease_email_stamp.restore_email_stamps``).
    """
    return await _send_to_tenant(
        lease_id=lease_id,
        user_id=user_id,
        organization_id=organization_id,
        is_eligible=lambda a: a.kind in LEASE_EMAIL_ATTACHMENT_KINDS,
        subject_for=build_subject,
        body_for=build_body_html,
    )


async def send_extension_addendum_to_tenant(
    *,
    lease_id: uuid.UUID,
    addendum_attachment_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    """Send one extension's addendum, and nothing else, to the tenant.

    Same best-effort contract and stamps as ``send_lease_to_tenant``; only the
    addendum is stamped as emailed, so the lease's own files keep whatever lock
    they had. A tenant already holds the lease; an earlier addendum would state
    an old end date.
    """
    return await _send_to_tenant(
        lease_id=lease_id,
        user_id=user_id,
        organization_id=organization_id,
        is_eligible=lambda a: a.id == addendum_attachment_id,
        subject_for=build_extension_subject,
        body_for=build_extension_body_html,
    )


async def _send_to_tenant(
    *,
    lease_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    is_eligible: Callable[[SignedLeaseAttachment], bool],
    subject_for: Callable[..., str],
    body_for: Callable[..., str],
) -> bool:
    # One transaction locks the lease, reads what will be sent and, when there
    # is something to send, stamps the lease and exactly the files being sent
    # (``lease_email_stamp``). The stamps are what lock the lease's documents,
    # so a regenerate that read the lease earlier is refused at its own write:
    # what is read here is what the tenant gets. The stamps stay if the SMTP
    # send fails, because the documents may have reached the tenant; the host
    # can always send again. A failed fetch means nothing went out, so the
    # stamps are put back unless a later email has stamped over them.
    previous: TenantEmailStamps | None = None
    async with unit_of_work() as db:
        # Generating a lease queues this with no check first, and whoever is trying
        # a demo account can type a real person's address.
        if await demo_repo.is_demo_org(db, organization_id):
            logger.info("lease_email.skipped reason=demo_workspace lease_id=%s", lease_id)
            return False

        lease = await signed_lease_repo.get(
            db,
            lease_id=lease_id,
            user_id=user_id,
            organization_id=organization_id,
            for_update=True,
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
        eligible = [a for a in attachments if is_eligible(a)]

        listing_title: str | None = None
        if lease.listing_id is not None:
            listing = await listing_repo.get_by_id(
                db, lease.listing_id, organization_id,
            )
            if listing is not None:
                listing_title = listing.title

        applicant_legal_name = applicant.legal_name
        contact_email = applicant.contact_email
        storage = get_storage()

        skip = _skip_reason(contact_email, eligible, storage)
        if skip is None:
            previous = await stamp_email_start(
                db, lease=lease, files=eligible, user_id=user_id, organization_id=organization_id,
            )

    if skip is not None:
        logger.log(skip.log_level, "lease_email.skipped reason=%s lease_id=%s", skip.reason, lease_id)
        await record_event(
            organization_id,
            "lease_email_skipped",
            skip.event_level,
            skip.message,
            {"lease_id": str(lease_id), "reason": skip.reason},
        )
        return False

    # Fetch attachment bytes from MinIO. If any one fetch fails we skip
    # the whole send — partial attachments would be confusing for the
    # tenant ("where's page 2?"). Generation already validated storage
    # was reachable, so this path is defensive.
    email_attachments: list[EmailAttachment] = []
    for a in eligible:
        try:
            content = storage.download_file(a.storage_key)
        except Exception:  # noqa: BLE001 — defensive; surface as a skip
            logger.warning(
                "lease_email.fetch_failed lease_id=%s storage_key=%s",
                lease_id, a.storage_key, exc_info=True,
            )
            await _give_up_after_fetch_failure(
                lease_id=lease_id, user_id=user_id, organization_id=organization_id,
                storage_key=a.storage_key, previous=previous,
            )
            return False
        email_attachments.append(
            EmailAttachment(
                filename=friendly_download_filename(a),
                content=content,
                content_type=a.content_type,
            )
        )

    subject = subject_for(applicant_legal_name=applicant_legal_name)
    body_html = body_for(listing_title=listing_title)

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


async def _give_up_after_fetch_failure(
    *,
    lease_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    storage_key: str,
    previous: TenantEmailStamps | None,
) -> None:
    """Record the skip, then put back the stamps that locked the documents: nothing was sent."""
    await record_event(
        organization_id,
        "lease_email_skipped",
        "warning",
        "Tenant email skipped: could not fetch one of the attachments.",
        {"lease_id": str(lease_id), "reason": "attachment_fetch_failed", "storage_key": storage_key},
    )
    if previous is None:
        return
    try:
        async with unit_of_work() as db:
            await restore_email_stamps(
                db, lease_id=lease_id, user_id=user_id, organization_id=organization_id, previous=previous,
            )
    except Exception:
        logger.error(
            "lease_email.restore_failed lease_id=%s attachment_ids=%s",
            lease_id, [str(i) for i in previous.files_emailed_at], exc_info=True,
        )
        raise


class _Skip(NamedTuple):
    reason: str
    message: str
    log_level: int
    event_level: str


def _skip_reason(contact_email: str | None, eligible: list, storage: object | None) -> _Skip | None:
    """Why nothing can be sent (checked before the lease is stamped), or None to go ahead."""
    if not contact_email:
        return _Skip("no_contact_email", "Tenant email skipped: applicant has no contact email on file.", logging.INFO, "info")
    if not email_service.is_configured():
        return _Skip("smtp_not_configured", "Tenant email skipped: SMTP is not configured on this deploy.", logging.INFO, "info")
    if not eligible:
        return _Skip("no_eligible_attachments", "Tenant email skipped: no documents to send.", logging.WARNING, "warning")
    if storage is None:
        return _Skip("storage_not_configured", "Tenant email skipped: object storage is not configured.", logging.WARNING, "warning")
    return None


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
