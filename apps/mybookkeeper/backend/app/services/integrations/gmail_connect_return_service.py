"""Sending Google's answer on to the app that started the Gmail connection.

Google's redirect carries no sign-in, so the callback can't tell who is completing
consent. It exchanges nothing: it forwards the code and state to the app named in
the signed state, and that app, signed in, finishes with POST /integrations/gmail/complete,
which only connects Gmail for the person who started it.

The phone's sign-in browser closes on reaching ``MOBILE_OAUTH_CALLBACK_URL``, and
the website's popup lands on its own page, so every outcome ends with a redirect.
"""
import logging
from urllib.parse import urlencode

from app.core.config import settings
from app.core.gmail_connect_client import GmailConnectClient
from app.core.gmail_connect_constants import (
    GMAIL_CONNECT_RESULT_ERROR,
    GOOGLE_OAUTH_ACCESS_DENIED,
    MOBILE_OAUTH_CALLBACK_URL,
    WEB_OAUTH_CALLBACK_PATH,
)
from app.core.gmail_connect_failure import GmailConnectFailure
from app.services.integrations import integration_service

logger = logging.getLogger(__name__)


def _return_address(client: GmailConnectClient) -> str:
    if client is GmailConnectClient.MOBILE:
        return MOBILE_OAUTH_CALLBACK_URL
    return f"{settings.frontend_url}{WEB_OAUTH_CALLBACK_PATH}"


def gmail_connect_return_url(state: str, code: str | None, google_error: str | None) -> str:
    """The fixed address of the app that started the connection, with Google's code
    and the state to finish it, or an allowlisted reason it ended at Google."""
    client = integration_service.gmail_connect_client(state)
    if google_error is not None or not code:
        failure = GmailConnectFailure.DENIED if google_error == GOOGLE_OAUTH_ACCESS_DENIED else GmailConnectFailure.FAILED
        logger.warning("Gmail connect ended at Google: client=%s error=%s reason=%s", client, google_error, failure)
        query = {"result": GMAIL_CONNECT_RESULT_ERROR, "reason": failure.value}
    else:
        query = {"code": code, "state": state}
    return f"{_return_address(client)}?{urlencode(query)}"
