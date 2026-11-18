"""Finishing a Gmail connection the phone started.

The phone's sign-in browser waits for ``MOBILE_OAUTH_CALLBACK_URL`` and closes on
reaching it, so every outcome, good or bad, ends with a redirect there. A raw error
page would leave the person staring at JSON with no way back but closing it.
"""
import logging
from urllib.parse import urlencode

from app.core.gmail_connect_constants import (
    GOOGLE_OAUTH_ACCESS_DENIED,
    MOBILE_OAUTH_CALLBACK_URL,
    MOBILE_OAUTH_RESULT_CONNECTED,
    MOBILE_OAUTH_RESULT_ERROR,
)
from app.core.gmail_connect_failure import GmailConnectFailure
from app.services.integrations import integration_service
from app.services.integrations.gmail_connect_error import GmailConnectError

logger = logging.getLogger(__name__)


def mobile_callback_url(failure: GmailConnectFailure | None) -> str:
    """The fixed deep link, with only an allowlisted result and reason added."""
    if failure is None:
        query = {"result": MOBILE_OAUTH_RESULT_CONNECTED}
    else:
        query = {"result": MOBILE_OAUTH_RESULT_ERROR, "reason": failure.value}
    return f"{MOBILE_OAUTH_CALLBACK_URL}?{urlencode(query)}"


async def finish_mobile_gmail_connect(code: str | None, google_error: str | None, state: str) -> str:
    """Finish the connection and return where to send the phone."""
    if google_error is not None or not code:
        failure = GmailConnectFailure.DENIED if google_error == GOOGLE_OAUTH_ACCESS_DENIED else GmailConnectFailure.FAILED
        logger.warning("Gmail connect from the phone ended at Google: error=%s reason=%s", google_error, failure)
        return mobile_callback_url(failure)
    try:
        await integration_service.handle_gmail_callback(code, state)
    except GmailConnectError as refused:
        logger.warning("Gmail connect from the phone refused: reason=%s detail=%s", refused.failure, refused)
        return mobile_callback_url(refused.failure)
    except Exception:
        logger.exception("Gmail connect from the phone failed: reason=%s", GmailConnectFailure.FAILED)
        return mobile_callback_url(GmailConnectFailure.FAILED)
    return mobile_callback_url(None)
