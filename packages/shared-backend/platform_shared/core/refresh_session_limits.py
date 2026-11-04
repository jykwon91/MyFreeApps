"""How long a device stays signed in."""

# Unused this long, a device has to sign in again.
REFRESH_SESSION_IDLE_SECONDS = 60 * 60 * 24 * 30

# However active, a device has to sign in again after this long.
REFRESH_SESSION_ABSOLUTE_SECONDS = 60 * 60 * 24 * 180

# How long a replaced secret still works, for a client whose response was lost.
# Counted from the refresh that replaced it. Retries don't extend it, and a client
# that returns later has to sign in again.
REFRESH_SESSION_PREVIOUS_SECRET_SECONDS = 24 * 60 * 60

# Oldest sessions are ended past this, so repeated logins can't grow a user's list.
REFRESH_SESSION_MAX_PER_USER = 20

MOBILE_ACCESS_TOKEN_SECONDS = 30 * 60

# Many phones can share one address on a mobile network, so this is generous.
REFRESH_ATTEMPTS_PER_IP = 120
REFRESH_IP_WINDOW_SECONDS = 5 * 60

# One device refreshes about twice an hour, plus retries.
REFRESH_ATTEMPTS_PER_SESSION = 30
REFRESH_SESSION_WINDOW_SECONDS = 60 * 60
