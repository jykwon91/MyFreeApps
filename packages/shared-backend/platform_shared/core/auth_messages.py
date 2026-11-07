"""Shared auth response messages.

Centralised so per-IP and account-lockout 429 responses are byte-identical —
callers cannot infer which gate fired (and therefore cannot infer whether
their target account is locked).
"""

# The web Login pages key their copy on this exact string
# (packages/shared-frontend/src/constants/auth-error-messages.ts) — change both.
RATE_LIMIT_GENERIC_DETAIL = "Too many attempts"
