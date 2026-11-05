"""Send an email with one attachment via Gmail, and find it again later.

The caller supplies the RFC 822 ``Message-ID``. Storing it before sending lets
the caller ask Gmail afterwards whether a send whose outcome was unknown
actually went out (``find_sent_message_id``), instead of guessing and risking
a second email.
"""
from __future__ import annotations

import asyncio
import base64
import logging
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError

from app.services.email.exceptions import GmailReauthRequiredError, GmailSendScopeError
from app.services.email.gmail_credentials import persist_refreshed_token
from app.services.email.gmail_request_executor import (
    mark_integration_needs_reauth,
    send_raw_gmail_message,
)
from app.services.email.gmail_service import get_gmail_service

logger = logging.getLogger(__name__)


async def send_message_with_attachment(
    integration,  # type: ignore[no-untyped-def] — app.models.integrations.Integration, avoid circular import
    *,
    from_address: str,
    to_address: str,
    subject: str,
    body: str,
    attachment_bytes: bytes,
    attachment_filename: str,
    attachment_content_type: str,
    message_id_header: str,
) -> str:
    """Send the message; return the Gmail-issued message id.

    Raises the ``gmail_request_executor`` hierarchy. On
    ``GmailReauthRequiredError`` ``Integration.needs_reauth`` is already set.
    """
    if not integration.access_token:
        raise GmailSendScopeError("Gmail integration has no access token")

    msg = MIMEMultipart()
    msg["From"] = from_address
    msg["To"] = to_address
    msg["Subject"] = subject
    msg["Message-ID"] = message_id_header
    msg.attach(MIMEText(body, "plain"))

    attachment_part = MIMEApplication(attachment_bytes, _subtype="octet-stream")
    attachment_part.add_header(
        "Content-Disposition", "attachment", filename=attachment_filename
    )
    attachment_part.add_header("Content-Type", attachment_content_type)
    msg.attach(attachment_part)

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

    return await send_raw_gmail_message(integration, raw, purpose="send receipts")


def rfc822msgid_query(message_id_header: str) -> str:
    return f"rfc822msgid:{message_id_header.strip().strip('<>')}"


def _search_term(value: str) -> str:
    return '"' + value.replace('"', "") + '"'


def sent_attachment_query(attachment_filename: str, to_address: str) -> str:
    return f"from:me to:{_search_term(to_address)} filename:{_search_term(attachment_filename)}"


async def _first_match(
    integration,  # type: ignore[no-untyped-def] — app.models.integrations.Integration, avoid circular import
    query: str,
) -> str | None:
    service, creds = get_gmail_service(integration.access_token, integration.refresh_token)
    prior_token = creds.token
    request = service.users().messages().list(userId="me", q=query, includeSpamTrash=True)
    try:
        found = await asyncio.to_thread(request.execute)
    except RefreshError as exc:
        await mark_integration_needs_reauth(integration, repr(exc))
        raise GmailReauthRequiredError(
            "Gmail token expired. Reconnect Gmail to send receipts."
        ) from exc
    except HttpError as exc:
        status = getattr(getattr(exc, "resp", None), "status", None)
        if status == 401:
            await mark_integration_needs_reauth(integration, f"HttpError 401: {exc!r}")
            raise GmailReauthRequiredError(
                "Gmail token rejected (401). Reconnect Gmail to send receipts."
            ) from exc
        raise
    await persist_refreshed_token(integration, creds, prior_token)
    messages = found.get("messages") or []
    first = messages[0].get("id") if messages else None
    return first if isinstance(first, str) and first else None


async def find_sent_message_id(
    integration,  # type: ignore[no-untyped-def] — app.models.integrations.Integration, avoid circular import
    message_id_header: str,
    *,
    attachment_filename: str | None,
    to_address: str,
) -> str | None:
    """Return Gmail's id for an earlier send of this message, or None.

    Looks up the ``Message-ID`` the caller set, then — in case Gmail ever
    replaced that header — a message from this mailbox to the same recipient
    carrying this attempt's attachment, whose filename holds this attempt's
    receipt number. Both searches include Trash. Gmail
    files a sent message under Sent the moment it sends, so "not found" means
    it was not sent. Raises on any API failure — an error is never reported
    as "not found".
    """
    found = await _first_match(integration, rfc822msgid_query(message_id_header))
    if found is None and attachment_filename:
        found = await _first_match(
            integration, sent_attachment_query(attachment_filename, to_address),
        )
    return found
