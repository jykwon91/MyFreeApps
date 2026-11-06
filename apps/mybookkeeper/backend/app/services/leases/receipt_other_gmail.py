"""Whether a stuck receipt went through a Gmail account that isn't connected any more."""
from __future__ import annotations

import datetime as _dt

from app.models.integrations.integration import Integration
from app.services.email.gmail_address_match import same_gmail_address
from app.services.email.send_claim_staleness import is_send_claim_stale


def sent_from_other_gmail(
    *,
    status: str,
    sender_gmail_address: str | None,
    send_message_id: str | None,
    send_claimed_at: _dt.datetime | None,
    integration: Integration | None,
    now: _dt.datetime,
) -> str | None:
    """The address a stale ``sending`` receipt went through, if sending can't settle it.

    Settling searches the connected mailbox, so it can't answer for another
    account, or for no account at all. A claim still within the stale window may
    belong to a send that's still running, and a connection whose address isn't
    known yet may well be the same account; both return None.
    """
    if (
        status != "sending"
        or sender_gmail_address is None
        or send_message_id is None
        or send_claimed_at is None
        or not is_send_claim_stale(send_claimed_at, now)
    ):
        return None
    if integration is not None and (
        integration.gmail_address is None
        or same_gmail_address(integration.gmail_address, sender_gmail_address)
    ):
        return None
    return sender_gmail_address
