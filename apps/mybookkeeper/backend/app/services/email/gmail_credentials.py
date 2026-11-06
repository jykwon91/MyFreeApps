"""Google OAuth credentials for a Gmail integration, and saving refreshed tokens."""
from __future__ import annotations

import logging

from google.oauth2.credentials import Credentials

from app.core.config import settings
from app.db.session import unit_of_work
from app.repositories import integration_repo

logger = logging.getLogger(__name__)


def build_gmail_credentials(access_token: str, refresh_token: str | None = None) -> Credentials:
    return Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
    )


async def persist_refreshed_token(
    integration,  # type: ignore[no-untyped-def] — app.models.integrations.Integration, avoid circular import
    creds: Credentials,
    prior_token: str | None,
) -> None:
    """Persist Google's in-memory refreshed access token back to the DB.

    Google's auth library rotates the access token whenever it expires (~1h),
    but the rotation lives only on the in-memory ``Credentials`` instance. If
    we don't write it back, every subsequent sync re-uses the original stored
    token, gets a 401, and pays for another refresh. With this helper, the
    refresh only happens once per real expiry.

    Opens its own ``unit_of_work`` so it isn't entangled with whatever
    transaction shape the caller has. Skipped when Gmail was reconnected while
    the call ran: the token belongs to the old connection.
    """
    if not creds.token or creds.token == prior_token:
        return
    async with unit_of_work() as db:
        saved = await integration_repo.update_access_token_if_unchanged(
            db, integration, creds.token, creds.expiry
        )
    if not saved:
        logger.info("Gmail was reconnected during this call; not saving its refreshed token")
