from enum import Enum


class GmailFailureKind(str, Enum):
    """How a failed Gmail or Google OAuth call should be handled."""

    REAUTH = "reauth"  # Google revoked or rejected the token: the user must reconnect
    SCOPE_MISSING = "scope_missing"  # 403 that isn't a rate limit: reconnect to grant access
    TRANSIENT = "transient"  # Google is down or limiting us: retry next cycle
    NOT_FOUND = "not_found"  # the message no longer exists
    OTHER = "other"  # unclassified: surface it, don't guess
