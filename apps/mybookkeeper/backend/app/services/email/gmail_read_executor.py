"""Run one Gmail read for a stored connection, with the shared auth handling.

A revoked refresh token (``invalid_grant``), a 401, or a 403 for a missing scope
marks the connection needs-reauth (only if it hasn't been reconnected since) and
raises ``GmailReauthRequiredError``. An access token refreshed along the way is
saved afterwards. Any other failure (an outage, a rate limit, a deleted message)
is logged with Google's error codes and propagates unchanged: the connection is
fine, so it is never marked.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from google.auth.exceptions import RefreshError
from googleapiclient.discovery import Resource
from googleapiclient.errors import HttpError
from googleapiclient.http import HttpRequest

from app.models.integrations.integration import Integration
from app.services.email.constants import GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR, GMAIL_SCOPE_MISSING_SYNC_LOG_ERROR
from app.services.email.exceptions import GmailReauthRequiredError
from app.services.email.gmail_credentials import persist_refreshed_token
from app.services.email.gmail_request_executor import mark_integration_needs_reauth
from app.services.email.gmail_failure_classifier import (
    classify_http_error,
    classify_refresh_error,
    describe_http_error,
    refresh_error_code,
)
from app.services.email.gmail_failure_kind import GmailFailureKind
from app.services.email.gmail_service import get_gmail_service

logger = logging.getLogger(__name__)


async def execute_gmail_read(
    integration: Integration,
    build_request: Callable[[Resource], HttpRequest],
    *,
    purpose: str,
) -> dict[str, object]:
    """Gmail's JSON response. ``purpose`` finishes the reconnect message ("send receipts")."""
    service, creds = get_gmail_service(integration.access_token, integration.refresh_token)
    prior_token = creds.token
    request = build_request(service)
    try:
        response = await asyncio.to_thread(request.execute)
    except RefreshError as exc:
        code = refresh_error_code(exc)
        if classify_refresh_error(exc) is not GmailFailureKind.REAUTH:
            logger.warning("Gmail read failed refreshing the token, connection left as is: oauth_error=%s", code)
            raise
        logger.warning("Gmail read rejected — refresh token revoked: oauth_error=%s", code)
        await mark_integration_needs_reauth(integration, GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR)
        raise GmailReauthRequiredError(
            f"Gmail token expired. Reconnect Gmail to {purpose}."
        ) from exc
    except HttpError as exc:
        kind = classify_http_error(exc)
        logger.warning("Gmail read failed: %s kind=%s", describe_http_error(exc), kind.value)
        if kind is GmailFailureKind.REAUTH:
            await mark_integration_needs_reauth(integration, GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR)
            raise GmailReauthRequiredError(
                f"Gmail token rejected (401). Reconnect Gmail to {purpose}."
            ) from exc
        if kind is GmailFailureKind.SCOPE_MISSING:
            await mark_integration_needs_reauth(integration, GMAIL_SCOPE_MISSING_SYNC_LOG_ERROR)
            raise GmailReauthRequiredError(
                f"Gmail read permission missing. Reconnect Gmail to {purpose}."
            ) from exc
        raise
    await persist_refreshed_token(integration, creds, prior_token)
    return response
