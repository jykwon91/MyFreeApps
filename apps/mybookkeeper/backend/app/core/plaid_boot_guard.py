"""Fail loud at boot when Plaid bank sync is not configured in production.

Same posture as the shared ``check_*_configured`` guards: a deployed app with
no Plaid keys would show a "Connect a bank" button that can only fail, and a
missing redirect URI silently drops every OAuth bank (Chase). Plaid is MBK's
alone, so the guard lives here rather than in ``platform_shared``.

The API lifespan and the scheduler worker (which runs the daily sync) both
call it.
"""
from __future__ import annotations

from app.core.plaid_not_configured_error import PlaidNotConfiguredError

_DEV_ENVIRONMENTS = ("development", "test")


def check_plaid_configured(
    *,
    environment: str,
    plaid_client_id: str,
    plaid_secret: str,
    plaid_redirect_uri: str,
) -> None:
    if environment in _DEV_ENVIRONMENTS:
        return
    missing = [
        name for name, value in (
            ("PLAID_CLIENT_ID", plaid_client_id),
            ("PLAID_SECRET", plaid_secret),
            ("PLAID_REDIRECT_URI", plaid_redirect_uri),
        ) if not value
    ]
    if missing:
        raise PlaidNotConfiguredError(
            "Plaid bank sync is not configured; unset: " + ", ".join(missing)
            + ". Set them in apps/mybookkeeper/backend/.env.docker (PLAID_ENV is "
            "sandbox or production), or set ENVIRONMENT=development.",
        )
    if not plaid_redirect_uri.startswith("https://"):
        raise PlaidNotConfiguredError(
            "PLAID_REDIRECT_URI must be an https URL registered in the Plaid "
            "dashboard (e.g. https://<domain>/plaid-oauth).",
        )
