"""Boot-time fail-loud guards for security-critical configuration.

These are checks that should crash the app at startup — not silently
warn — when a security-critical setting is missing in a production-like
environment. The lifespan calls them right after init_sentry() so any
RuntimeError they raise is captured in Sentry and surfaced via the
healthcheck → deploy rollback chain.

Each guard takes its inputs as explicit kwargs so platform_shared has
no transitive dependency on per-app settings modules.
"""

_DEV_ENVIRONMENTS = ("development", "test")


class TurnstileNotConfiguredError(RuntimeError):
    """Raised at boot when Turnstile is not configured in a non-dev environment."""


def check_turnstile_configured(
    *,
    turnstile_secret_key: str,
    environment: str,
) -> None:
    """Fail loud at boot if Turnstile is missing in a non-dev environment.

    Cloudflare Turnstile is the CAPTCHA gate on ``/auth/register`` and
    ``/auth/forgot-password``. Running without it in production is a
    credential-stuffing vulnerability — bots can hammer the registration
    endpoint and burn HIBP/email-send budget without slowdown.

    In development / test, the key is intentionally empty — the
    ``require_turnstile`` dependency short-circuits when the key is
    absent, which is the desired CI/dev behaviour. Production /
    staging require it to be set.

    Args:
        turnstile_secret_key: The Cloudflare Turnstile server-side secret.
        environment: The deployment environment name. ``"development"``
            and ``"test"`` allow an empty key; everything else does not.

    Raises:
        TurnstileNotConfiguredError: If ``environment`` is not
            ``"development"`` or ``"test"`` and ``turnstile_secret_key``
            is empty.
    """
    if environment in _DEV_ENVIRONMENTS:
        return
    if turnstile_secret_key:
        return
    raise TurnstileNotConfiguredError(
        "TURNSTILE_SECRET_KEY must be set in non-development environments. "
        "Cloudflare Turnstile is the CAPTCHA gate on /auth/register and "
        "/auth/forgot-password — running prod without it is a credential-stuffing "
        "vulnerability. Set TURNSTILE_SECRET_KEY or set ENVIRONMENT=development."
    )
