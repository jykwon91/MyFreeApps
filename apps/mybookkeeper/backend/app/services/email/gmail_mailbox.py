"""Which Gmail account a connection is: the address from Gmail's getProfile.

Stored on the integration and on every send claim, so a claim is only ever
settled by searching the mailbox it was sent from.
"""
from __future__ import annotations

import asyncio
import logging

from google.oauth2.credentials import Credentials
from googleapiclient.errors import HttpError

from app.db.session import unit_of_work
from app.models.integrations.integration import Integration
from app.repositories import integration_repo
from app.services.email.exceptions import GmailAccountUnknownError, GmailReauthRequiredError
from app.services.email.gmail_read_executor import execute_gmail_read
from app.services.email.gmail_service import get_gmail_service

logger = logging.getLogger(__name__)


def _address_from(profile: dict[str, object]) -> str:
    address = profile.get("emailAddress")
    if not isinstance(address, str) or not address.strip():
        raise GmailAccountUnknownError("Gmail's profile had no email address")
    return address.strip()


def _log_profile_failure(context: str, exc: Exception) -> None:
    if isinstance(exc, HttpError):
        logger.warning(
            "Gmail getProfile failed (%s): status=%s reason=%s details=%s",
            context, exc.status_code, exc.reason, exc.error_details,
        )
    else:
        logger.warning("Gmail getProfile failed (%s)", context, exc_info=True)


async def address_of_new_connection(creds: Credentials) -> str:
    """The address of the account an OAuth callback just connected. Raises on any failure."""
    service, _ = get_gmail_service(creds.token, creds.refresh_token)
    try:
        profile = await asyncio.to_thread(service.users().getProfile(userId="me").execute)
    except Exception as exc:
        _log_profile_failure("new connection", exc)
        raise
    return _address_from(profile)


async def ensure_gmail_address(integration: Integration, *, purpose: str) -> str:
    """The connection's address, asking Gmail once for rows connected before it was stored.

    Raises ``GmailReauthRequiredError`` when Google refuses the token, and
    ``GmailAccountUnknownError`` on any other failure. The address is returned
    even when it can't be saved because Gmail was reconnected meanwhile: it is
    still the account these tokens send through.
    """
    if integration.gmail_address:
        return integration.gmail_address
    try:
        profile = await execute_gmail_read(
            integration,
            lambda service: service.users().getProfile(userId="me"),
            purpose=purpose,
        )
    except GmailReauthRequiredError:
        raise
    except Exception as exc:
        _log_profile_failure(f"integration {integration.id}", exc)
        raise GmailAccountUnknownError("Couldn't ask Gmail which account this is.") from exc
    address = _address_from(profile)
    async with unit_of_work() as db:
        saved = await integration_repo.set_gmail_address_if_unchanged(db, integration, address)
    if not saved:
        logger.info("Gmail was reconnected while its address was looked up; not saving it")
    return address
