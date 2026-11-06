"""Run one Gmail read for a stored connection, with the shared auth handling.

A refresh token Google refuses, or a 401, marks the connection needs-reauth
(only if it hasn't been reconnected since) and raises
``GmailReauthRequiredError``. An access token refreshed along the way is saved
afterwards. Any other failure propagates unchanged.
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable

from google.auth.exceptions import RefreshError
from googleapiclient.discovery import Resource
from googleapiclient.errors import HttpError
from googleapiclient.http import HttpRequest

from app.models.integrations.integration import Integration
from app.services.email.exceptions import GmailReauthRequiredError
from app.services.email.gmail_credentials import persist_refreshed_token
from app.services.email.gmail_request_executor import mark_integration_needs_reauth
from app.services.email.gmail_service import get_gmail_service


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
    return response
