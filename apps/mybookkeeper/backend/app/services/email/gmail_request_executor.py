"""Send a raw message through Gmail and classify how it failed.

Shared by every Gmail send so they all split failures the same way:

- ``GmailReauthRequiredError`` — refresh token invalid or 401. ``needs_reauth``
  is set on the integration before this raises.
- ``GmailSendScopeError`` — 403, the integration lacks the needed scope.
- ``GmailSendError`` — Gmail definitely rejected the request (other 4xx,
  including a 403 rate limit).
- ``GmailSendOutcomeUnknownError`` — 5xx, timeout, connection error, or a
  success with no message id: the message may have been sent.

The POST goes through ``requests`` rather than the discovery client's
httplib2, because httplib2 silently re-sends a request whose connection drops
before the response arrives — a second email. ``requests`` never retries a
POST. The only resend is ``AuthorizedSession`` repeating a 401 after a token
refresh, and a 401 means Gmail didn't accept the first one.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

import requests
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import AuthorizedSession
from google.oauth2.credentials import Credentials

from app.db.session import unit_of_work
from app.repositories import integration_repo
from app.services.email.constants import (
    GMAIL_HTTP_TIMEOUT_SECONDS,
    GMAIL_RATE_LIMIT_REASONS,
    GMAIL_SEND_URL,
)
from app.services.email.exceptions import (
    GmailReauthRequiredError,
    GmailSendError,
    GmailSendOutcomeUnknownError,
    GmailSendScopeError,
)
from app.services.email.gmail_credentials import (
    build_gmail_credentials,
    persist_refreshed_token,
)

logger = logging.getLogger(__name__)


async def mark_integration_needs_reauth(
    integration,  # type: ignore[no-untyped-def] — app.models.integrations.Integration, avoid circular import
    reason: str,
) -> None:
    async with unit_of_work() as db:
        stale = await integration_repo.get_by_org_and_provider(
            db, integration.organization_id, "gmail"
        )
        if stale is not None:
            await integration_repo.mark_needs_reauth(
                db, stale, reason[:200], datetime.now(timezone.utc)
            )


def post_message_send(creds: Credentials, raw: str) -> requests.Response:
    """POST ``users.messages.send`` once. Blocking; refreshes the token on a 401."""
    with AuthorizedSession(creds) as session:
        return session.post(
            GMAIL_SEND_URL,
            json={"raw": raw},
            timeout=GMAIL_HTTP_TIMEOUT_SECONDS,
            allow_redirects=False,  # a followed 307/308 would POST the message again
        )


def _error_reasons(response: requests.Response) -> set[str]:
    """Reasons from both Google error shapes: ``errors[]`` and ``details[]``."""
    try:
        error = response.json().get("error", {})
        entries = [*error.get("errors", []), *error.get("details", [])]
        return {e.get("reason") for e in entries if isinstance(e, dict)}
    except (ValueError, AttributeError, TypeError):
        return set()


def _sent_id(response: requests.Response) -> str | None:
    try:
        sent_id = response.json().get("id")
    except (ValueError, AttributeError):
        return None
    return sent_id if isinstance(sent_id, str) and sent_id else None


async def send_raw_gmail_message(
    integration,  # type: ignore[no-untyped-def] — app.models.integrations.Integration, avoid circular import
    raw: str,
    *,
    purpose: str,
) -> str:
    """Send a base64url RFC 822 message; return Gmail's message id.

    ``purpose`` finishes the reconnect message ("send receipts"). Never
    retried: a retry of a send that reached Gmail is a second email.
    """
    creds = build_gmail_credentials(integration.access_token, integration.refresh_token)
    prior_token = creds.token
    try:
        response = await asyncio.to_thread(post_message_send, creds, raw)
    except RefreshError as exc:
        logger.warning("Gmail send rejected — refresh token invalid: %s", exc)
        await mark_integration_needs_reauth(integration, repr(exc))
        raise GmailReauthRequiredError(
            f"Gmail token expired. Reconnect Gmail to {purpose}."
        ) from exc
    except Exception as exc:  # timeouts, connection resets, SSL errors
        logger.error("Gmail send outcome unknown: unexpected error", exc_info=True)
        raise GmailSendOutcomeUnknownError(
            "Gmail send was interrupted; the message may have been sent"
        ) from exc

    status = response.status_code
    if status == 401:
        logger.warning("Gmail send rejected with 401 — token rejected by Google")
        await mark_integration_needs_reauth(integration, "Gmail send returned 401")
        raise GmailReauthRequiredError(
            f"Gmail token rejected (401). Reconnect Gmail to {purpose}."
        )
    if status == 403:
        if _error_reasons(response) & GMAIL_RATE_LIMIT_REASONS:
            logger.warning("Gmail send rate-limited (403)")
            raise GmailSendError("Gmail is limiting how fast you can send. Try again later.")
        logger.warning("Gmail send rejected with 403 — likely missing gmail.send scope")
        raise GmailSendScopeError(
            f"Gmail send permission missing. Reconnect Gmail to {purpose}.",
        )
    if status >= 500:
        logger.error("Gmail send outcome unknown: status=%s", status)
        raise GmailSendOutcomeUnknownError(
            f"Gmail had a server error (status {status}); the message may have been sent"
        )
    if status >= 400:
        logger.warning("Gmail send failed: status=%s", status)
        raise GmailSendError(f"Gmail rejected the message (status {status})")

    sent_id = _sent_id(response)
    if sent_id is None:
        logger.error("Gmail send returned no message id: status=%s", status)
        raise GmailSendOutcomeUnknownError("Gmail did not return a message id")

    # The email is out; failing to save a refreshed token must not read as a
    # failed send. The next call just refreshes again.
    try:
        await persist_refreshed_token(integration, creds, prior_token)
    except Exception:
        logger.warning("Couldn't save the refreshed Gmail token after a send", exc_info=True)
    return sent_id
