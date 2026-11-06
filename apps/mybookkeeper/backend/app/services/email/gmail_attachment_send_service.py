"""Send an email with one attachment via Gmail, and find it again later.

The caller supplies the RFC 822 ``Message-ID``. Storing it before sending lets
the caller ask Gmail afterwards whether a send whose outcome was unknown
actually went out (``find_sent_message_id``, built on ``gmail_sent_lookup``),
instead of guessing and risking a second email.
"""
from __future__ import annotations

import base64
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.services.email import gmail_sent_lookup
from app.services.email.constants import GMAIL_PURPOSE_SEND_RECEIPTS
from app.services.email.exceptions import GmailSendScopeError
from app.services.email.gmail_request_executor import send_raw_gmail_message


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

    return await send_raw_gmail_message(integration, raw, purpose=GMAIL_PURPOSE_SEND_RECEIPTS)


def _search_term(value: str) -> str:
    return '"' + value.replace('"', "") + '"'


def sent_attachment_query(attachment_filename: str, to_address: str) -> str:
    return f"from:me to:{_search_term(to_address)} filename:{_search_term(attachment_filename)}"


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
    receipt number. See ``gmail_sent_lookup`` for what "not found" means.
    """
    found = await gmail_sent_lookup.find_by_message_id_header(
        integration, message_id_header, purpose=GMAIL_PURPOSE_SEND_RECEIPTS,
    )
    if found is None and attachment_filename:
        found = await gmail_sent_lookup.first_match(
            integration, sent_attachment_query(attachment_filename, to_address), purpose=GMAIL_PURPOSE_SEND_RECEIPTS,
        )
    return found
