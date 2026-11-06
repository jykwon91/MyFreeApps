"""Ask Gmail whether a message this mailbox may have sent is in it.

A sender that stores the RFC 822 ``Message-ID`` before sending can settle a send
whose outcome was unknown by searching for it, instead of guessing and risking a
second email. Searches include Trash. Gmail files a sent message under Sent the
moment it sends, so "not found" means it was not sent. Any API failure raises —
an error is never reported as "not found".
"""
from __future__ import annotations

from app.models.integrations.integration import Integration
from app.services.email.gmail_read_executor import execute_gmail_read


def rfc822msgid_query(message_id_header: str) -> str:
    return f"rfc822msgid:{message_id_header.strip().strip('<>')}"


async def first_match(integration: Integration, query: str, *, purpose: str) -> str | None:
    """Gmail's id for the first message matching ``query``, or None.

    ``purpose`` finishes the reconnect message ("send receipts").
    """
    found = await execute_gmail_read(
        integration,
        lambda service: service.users().messages().list(userId="me", q=query, includeSpamTrash=True),
        purpose=purpose,
    )
    messages = found.get("messages")
    if not isinstance(messages, list) or not messages:
        return None
    first = messages[0].get("id") if isinstance(messages[0], dict) else None
    return first if isinstance(first, str) and first else None


async def find_by_message_id_header(
    integration: Integration,
    message_id_header: str,
    *,
    purpose: str,
) -> str | None:
    """Gmail's id for the message sent with this ``Message-ID``, or None."""
    return await first_match(integration, rfc822msgid_query(message_id_header), purpose=purpose)
