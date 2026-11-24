"""Raised when Plaid credentials are missing.

At boot outside development and test (``check_plaid_configured``), and at call
time in development when someone tries to connect a bank with no sandbox keys.
"""


class PlaidNotConfiguredError(RuntimeError):
    pass
