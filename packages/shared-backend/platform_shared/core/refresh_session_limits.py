"""How long a device stays signed in."""

# Unused this long, a device has to sign in again.
REFRESH_SESSION_IDLE_SECONDS = 60 * 60 * 24 * 30

# However active, a device has to sign in again after this long.
REFRESH_SESSION_ABSOLUTE_SECONDS = 60 * 60 * 24 * 180

# How long a replaced secret still works, for a client whose response was lost.
REFRESH_SESSION_PREVIOUS_SECRET_SECONDS = 60 * 60
