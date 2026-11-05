"""What the account guard decided about an attempt."""
from enum import StrEnum


class GuardOutcome(StrEnum):
    ALLOWED = "allowed"
    LOCKED = "locked"
    WRONG = "wrong"
    # 2FA changed since the request began: a double press, not a guess.
    STATE_CHANGED = "state_changed"
