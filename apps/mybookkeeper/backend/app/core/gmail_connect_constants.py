# The Gmail OAuth callback's refusal when, by the time Google sends the user
# back, they're no longer a member of the workspace they started from or are
# now a viewer there.
GMAIL_CONNECT_NOT_ALLOWED_DETAIL = (
    "You can't connect Gmail for that workspace any more. Ask one of its admins."
)

# Where the callback sends a connection the phone started. Fixed here, never read
# from the request, so the callback can't be made to redirect anywhere else. The
# phone's sign-in browser closes when it reaches this address (app.json's scheme).
MOBILE_OAUTH_CALLBACK_URL = "mybookkeeper://oauth-callback"
MOBILE_OAUTH_RESULT_CONNECTED = "connected"
MOBILE_OAUTH_RESULT_ERROR = "error"

# Google's ``error`` on the callback when the person declines the consent screen.
GOOGLE_OAUTH_ACCESS_DENIED = "access_denied"

# The website's callback when Google sent back no authorization code.
GMAIL_CONNECT_NO_CODE_DETAIL = "Google didn't authorize the connection"
