"""Fail loud at boot when Plaid bank sync is not configured in production.

Same posture as the shared ``check_*_configured`` guards: a deployed app with
no Plaid keys would show a "Connect a bank" button that can only fail, and a
non-https FRONTEND_URL gives Plaid no redirect URI, which silently drops every
OAuth bank (Chase). Plaid is MBK's
alone, so the guard lives here rather than in ``platform_shared``.

The API lifespan and the scheduler worker (which runs the daily sync) both
call it.
"""
from __future__ import annotations

from app.core.plaid_constants import PLAID_OAUTH_REDIRECT_PATH
from app.core.plaid_not_configured_error import PlaidNotConfiguredError

_DEV_ENVIRONMENTS = ("development", "test")


def check_plaid_configured(
    *,
    environment: str,
    plaid_client_id: str,
    plaid_secret: str,
    frontend_url: str,
) -> None:
    if environment in _DEV_ENVIRONMENTS:
        return
    missing = [
        name for name, value in (
            ("PLAID_CLIENT_ID", plaid_client_id),
            ("PLAID_SECRET", plaid_secret),
        ) if not value
    ]
    if missing:
        raise PlaidNotConfiguredError(
            "Plaid bank sync is not configured; unset: " + ", ".join(missing)
            + ". Set them in apps/mybookkeeper/backend/.env.docker (PLAID_ENV is "
            "sandbox or production).",
        )
    if not frontend_url.startswith("https://"):
        raise PlaidNotConfiguredError(
            "FRONTEND_URL must be https: Plaid sends OAuth banks back to "
            f"FRONTEND_URL{PLAID_OAUTH_REDIRECT_PATH}, which must be registered in "
            "the Plaid dashboard.",
        )
