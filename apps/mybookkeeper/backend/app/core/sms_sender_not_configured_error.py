"""Raised at boot when texts would go out with no valid ``SMS_SENDER_USER_ID``."""


class SmsSenderNotConfiguredError(RuntimeError):
    pass
