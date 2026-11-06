"""Ask Gmail whether a message this mailbox may have sent is in it.

A sender that stores the RFC 822 ``Message-ID`` before sending can settle a send
whose outcome was unknown by searching for it, instead of guessing and risking a
second email. Searches include Trash. Gmail files a sent message under Sent the
moment it sends, so "not found" means it was not sent. Any API failure raises —
an error is never reported as "not found".
"""
from __future__ import annotations

import asyncio

from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError

from app.services.email.exceptions import GmailReauthRequiredError
from app.services.email.gmail_credentials import persist_refreshed_token
from app.services.email.gmail_request_executor import mark_integration_needs_reauth
from app.services.email.gmail_service import get_gmail_service


def rfc822msgid_query(message_id_header: str) -> str:
    return f"rfc822msgid:{message_id_header.strip().strip('<>')}"


async def first_match(
    integration,  # type: ignore[no-untyped-def] — app.models.integrations.Integration, avoid circular import
    query: str,
    *,
    purpose: str,
) -> str | None:
    """Gmail's id for the first message matching ``query``, or None.

    ``purpose`` finishes the reconnect message ("send receipts").
    """
    service, creds = get_gmail_service(integration.access_token, integration.refresh_token)
    prior_token = creds.token
    request = service.users().messages().list(userId="me", q=query, includeSpamTrash=True)
    try:
        found = await asyncio.to_thread(request.execute)
    except RefreshError as exc:
        await mark_integration_needs_reauth(integration, repr(exc))
        raise GmailReauthRequiredError(
            f"Gmail token expired. Reconnect Gmail to {purpose}."
        ) from exc
    except HttpError as exc:
        status = getattr(getattr(exc, "resp", None), "status", None)
        if status == 401:
            await mark_integration_needs_reauth(integration, f"HttpError 401: {exc!r}")
            raise GmailReauthRequiredError(
                f"Gmail token rejected (401). Reconnect Gmail to {purpose}."
            ) from exc
        raise
    await persist_refreshed_token(integration, creds, prior_token)
    messages = found.get("messages") or []
    first = messages[0].get("id") if messages else None
    return first if isinstance(first, str) and first else None


async def find_by_message_id_header(
    integration,  # type: ignore[no-untyped-def] — app.models.integrations.Integration, avoid circular import
    message_id_header: str,
    *,
    purpose: str,
) -> str | None:
    """Gmail's id for the message sent with this ``Message-ID``, or None."""
    return await first_match(integration, rfc822msgid_query(message_id_header), purpose=purpose)
