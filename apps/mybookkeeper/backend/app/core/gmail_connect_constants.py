from app.core.gmail_connect_failure import GmailConnectFailure

# The Gmail OAuth callback's refusal when, by the time Google sends the user
# back, they're no longer a member of the workspace they started from or are
# now a viewer there.
GMAIL_CONNECT_NOT_ALLOWED_DETAIL = (
    "You can't connect Gmail for that workspace any more. Ask one of its admins."
)

# Where the callback sends Google's answer on to. Fixed here, never read from the
# request, so the callback can't be made to redirect anywhere else. The app that
# started the connection then finishes it, signed in, with POST /integrations/gmail/complete.
# The website's page is under ``frontend_url``. The phone's sign-in browser closes
# when it reaches its address (app.json's scheme).
WEB_OAUTH_CALLBACK_PATH = "/oauth-callback"
MOBILE_OAUTH_CALLBACK_URL = "mybookkeeper://oauth-callback"
GMAIL_CONNECT_RESULT_ERROR = "error"

# Google's ``error`` on the callback when the person declines the consent screen.
GOOGLE_OAUTH_ACCESS_DENIED = "access_denied"

# Bounds on what an app hands back to finish a connection. Google's codes and our
# signed state are far shorter; anything longer isn't one of them.
GMAIL_CONNECT_CODE_MAX_LENGTH = 2048
GMAIL_CONNECT_STATE_MAX_LENGTH = 4096

# Refusals answered 403 rather than 400 when an app finishes a connection: the
# request was well-formed, but this person may not finish it.
GMAIL_CONNECT_FORBIDDEN_FAILURES = frozenset({
    GmailConnectFailure.NOT_ALLOWED,
    GmailConnectFailure.WRONG_ACCOUNT,
})
