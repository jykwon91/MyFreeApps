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


class EmailNotConfiguredError(RuntimeError):
    """Raised at boot when the email backend is missing creds in a non-dev environment."""


def check_email_configured(
    *,
    email_backend: str,
    smtp_user: str,
    smtp_password: str,
    environment: str,
) -> None:
    """Fail loud at boot if email delivery isn't usable in a non-dev environment.

    Two failure modes guarded:

    1. ``email_backend == "console"`` in production / staging.
       Console-mode emails go to stdout — fine for dev/CI where the
       operator can see them, useless in production where they
       silently disappear (this is exactly how the 2026-05-05
       ``kennethmontgo@gmail.com`` registration broke: MJH was
       deployed with the default console backend, the verification
       email was logged to docker stdout, and the user could never
       finish signup).

    2. ``email_backend == "smtp"`` with empty ``SMTP_USER`` or
       ``SMTP_PASSWORD``. The ``EmailService`` silently returns
       ``False`` on send when creds are empty — an operator who
       forgot to set them would only notice when users complain.

    Both modes silently break critical-path flows (verification,
    password reset, organization invites). Crash the lifespan so the
    healthcheck catches the misconfig before users hit it.

    Args:
        email_backend: ``"console"`` (dev/CI default — log to stdout)
            or ``"smtp"`` (production — send via SMTP).
        smtp_user: SMTP authentication username. Required for
            ``email_backend == "smtp"``.
        smtp_password: SMTP authentication password. Required for
            ``email_backend == "smtp"``.
        environment: The deployment environment name. ``"development"``
            and ``"test"`` allow any combination; everything else
            requires a working ``smtp`` backend.

    Raises:
        EmailNotConfiguredError: If ``environment`` is not dev/test and
            either (a) ``email_backend == "console"``, or (b)
            ``email_backend == "smtp"`` with empty credentials.
    """
    if environment in _DEV_ENVIRONMENTS:
        return
    if email_backend == "console":
        raise EmailNotConfiguredError(
            "EMAIL_BACKEND='console' is not allowed in non-development "
            "environments — verification emails, password resets, and other "
            "transactional emails would silently log to stdout instead of "
            "reaching users (this is how the 2026-05-05 MJH verification-email "
            "outage happened). Set EMAIL_BACKEND=smtp and configure SMTP_USER "
            "/ SMTP_PASSWORD, or set ENVIRONMENT=development."
        )
    if email_backend == "smtp" and not (smtp_user and smtp_password):
        raise EmailNotConfiguredError(
            "EMAIL_BACKEND='smtp' requires both SMTP_USER and SMTP_PASSWORD "
            "to be set in non-development environments. Without them the "
            "EmailService silently no-ops and transactional emails never "
            "reach users. Set the credentials or set ENVIRONMENT=development."
        )
