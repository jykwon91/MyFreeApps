"""Operator email notification when a public-form inquiry arrives (T0).

Sent for ``clean`` and ``flagged`` inquiries; ``spam`` and ``unscored``
(graceful Claude degradation) skip notification by design — operators
asked us not to flood the inbox.

Graceful degradation: if SMTP isn't configured (dev/CI) or the operator
hasn't set ``cost_alert_recipients`` (which doubles as the operator's
notification address — distinct from the inquirer email), we log + return
without sending. Inquiry is still persisted.
"""
from __future__ import annotations

import html as html_mod
import logging
import uuid

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.repositories.inquiries import inquiry_repo
from app.repositories.listings import listing_repo
from app.services.inquiries.inquiry_rent_proration import (
    estimated_total_rent,
    stay_duration_days,
)
from app.services.system import email_service

logger = logging.getLogger(__name__)


def _build_email_body(
    *,
    name: str,
    listing_title: str,
    spam_status: str,
    spam_score: float | None,
    move_in_date: str,
    move_out_date: str,
    duration_days: int | None,
    estimated_rent: str | None,
    occupant_count: int,
    has_pets: bool,
    why_this_room: str,
    inquiry_url: str,
) -> str:
    safe_name = html_mod.escape(name)
    safe_title = html_mod.escape(listing_title)
    safe_why = html_mod.escape(why_this_room)
    score_line = (
        f"<strong>Spam score:</strong> {spam_score:.0f} / 100"
        if spam_score is not None else "<strong>Spam score:</strong> n/a"
    )
    pets_label = "yes" if has_pets else "no"
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto;">
      <div style="background: #2563eb; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">New inquiry — {safe_title}</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151;">
          {safe_name} just submitted an inquiry through your public form.
        </p>
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">
          <strong>Status:</strong> {html_mod.escape(spam_status)}
          &nbsp;·&nbsp; {score_line}
        </p>
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">
          <strong>Move-in:</strong> {html_mod.escape(move_in_date)}
          &nbsp;·&nbsp; <strong>Move-out:</strong> {html_mod.escape(move_out_date)}
          {f"&nbsp;·&nbsp; <strong>Duration:</strong> {duration_days} days" if duration_days is not None else ""}
        </p>
        {f'<p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;"><strong>Estimated total rent:</strong> ${estimated_rent}</p>' if estimated_rent else ""}
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">
          <strong>Occupants:</strong> {occupant_count}
          &nbsp;·&nbsp; <strong>Pets:</strong> {pets_label}
        </p>
        <p style="margin: 12px 0 0 0; font-size: 14px; color: #374151; white-space: pre-wrap;">
          {safe_why}
        </p>
        <p style="margin: 16px 0 0 0;">
          <a href="{html_mod.escape(inquiry_url)}"
             style="display: inline-block; background: #2563eb; color: white; padding: 8px 14px; border-radius: 6px; text-decoration: none; font-size: 14px;">
            View inquiry in MyBookkeeper
          </a>
        </p>
      </div>
    </div>
    """


def _resolve_operator_email() -> str | None:
    """The address the operator wants notifications at.

    Today this reuses the cost-alert recipient list (single-tenant MBK).
    A future ``operator_notification_email`` setting would let large teams
    distinguish, but solo-host MBK doesn't need it yet.
    """
    raw = settings.cost_alert_recipients.strip()
    if raw:
        # Take the first; cost alerts may have many recipients but a public
        # inquiry only goes to the primary contact.
        return raw.split(",")[0].strip()
    return None


async def send_inquiry_notification(
    *, inquiry_id: uuid.UUID, subject_prefix: str = "",
) -> bool:
    """Email the operator about a new inquiry. Returns False if not sent.

    Graceful degradation:
    - No operator email configured → log + return False, inquiry still saved.
    - Email send fails → log + return False, inquiry still saved.
    - Inquiry / listing not found at notification time → log + return False
      (shouldn't happen — service writes inquiry before scheduling task).
    """
    operator_email = _resolve_operator_email()
    if not operator_email:
        logger.info(
            "Public inquiry notification skipped: no operator email configured "
            "(set cost_alert_recipients)"
        )
        return False

    async with AsyncSessionLocal() as db:
        # Fetching by ID without org scope because the notification path is
        # internal — we know the inquiry is real (the public service just
        # wrote it). Using a more permissive lookup avoids needing to plumb
        # organization_id through the background task signature.
        from sqlalchemy import select
        from app.models.inquiries.inquiry import Inquiry

        result = await db.execute(select(Inquiry).where(Inquiry.id == inquiry_id))
        inquiry = result.scalar_one_or_none()
        if inquiry is None:
            logger.warning("Inquiry %s not found at notification time", inquiry_id)
            return False
        listing = (
            await listing_repo.get_by_id(db, inquiry.listing_id, inquiry.organization_id)
            if inquiry.listing_id is not None else None
        )

    listing_title = listing.title if listing is not None else "(no listing)"
    base_url = settings.app_url or settings.frontend_url
    inquiry_url = f"{base_url.rstrip('/')}/inquiries/{inquiry_id}"

    subject = (
        f"{subject_prefix}[New Inquiry] {inquiry.inquirer_name or 'Anonymous'} — "
        f"{listing_title}"
    )
    duration = stay_duration_days(inquiry.move_in_date, inquiry.move_out_date)
    estimated = (
        estimated_total_rent(
            monthly_rate=listing.monthly_rate if listing is not None else None,
            move_in_date=inquiry.move_in_date,
            move_out_date=inquiry.move_out_date,
        )
        if listing is not None else None
    )
    body = _build_email_body(
        name=inquiry.inquirer_name or "Anonymous",
        listing_title=listing_title,
        spam_status=inquiry.spam_status,
        spam_score=(
            float(inquiry.spam_score) if inquiry.spam_score is not None else None
        ),
        move_in_date=(
            inquiry.move_in_date.isoformat() if inquiry.move_in_date else "(not set)"
        ),
        move_out_date=(
            inquiry.move_out_date.isoformat() if inquiry.move_out_date else "(not set)"
        ),
        duration_days=duration,
        estimated_rent=f"{estimated:,.2f}" if estimated is not None else None,
        occupant_count=inquiry.occupant_count or 0,
        has_pets=bool(inquiry.has_pets),
        why_this_room=inquiry.why_this_room or "",
        inquiry_url=inquiry_url,
    )

    try:
        return email_service.send_email([operator_email], subject, body)
    except Exception:  # noqa: BLE001 — email failures must not crash the request
        logger.warning(
            "Failed to send inquiry notification for %s", inquiry_id, exc_info=True,
        )
        return False
