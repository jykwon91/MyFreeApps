"""How long a device stays signed in."""

# Unused this long, a device has to sign in again.
REFRESH_SESSION_IDLE_SECONDS = 60 * 60 * 24 * 30

# However active, a device has to sign in again after this long.
REFRESH_SESSION_ABSOLUTE_SECONDS = 60 * 60 * 24 * 180

# How long a replaced secret still works, for a client whose response was lost:
# a phone can drop a refresh mid-flight and not reopen the app until the next day.
REFRESH_SESSION_PREVIOUS_SECRET_SECONDS = 24 * 60 * 60
