"""The bank wants the person to sign in again before it shares anything;
syncing would only be refused. Reconnect (Link update mode) clears it."""


class PlaidLoginRequiredError(RuntimeError):
    pass
