"""Shared auth response messages.

Centralised so per-IP and account-lockout 429 responses are byte-identical —
callers cannot infer which gate fired (and therefore cannot infer whether
their target account is locked).
"""

RATE_LIMIT_GENERIC_DETAIL = "Too many attempts"
