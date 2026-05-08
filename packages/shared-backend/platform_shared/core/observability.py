"""Sentry initialisation with fail-loud production enforcement.

Each app's ``app/core/observability.py`` is a thin wrapper around
``init_sentry()`` that injects the app's own ``settings.sentry_dsn`` and
``settings.environment`` values — keeping the call sites in main.py
unchanged while the actual SDK init logic lives here, in platform_shared.

In production (``environment="production"``), a missing DSN is a
deployment-time fault — not a graceful degradation. The FastAPI lifespan
calls ``init_sentry()`` at boot; if the DSN is absent in prod, it raises
``SentryNotConfiguredError`` which crashes the lifespan, fails the
healthcheck, and triggers a deploy rollback.

In non-production environments (``development``, ``test``, etc.), Sentry is
optional — ``init_sentry()`` exits silently when the DSN is empty.
"""

import logging
from typing import Any

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

logger = logging.getLogger(__name__)

_PROD_ENV = "production"

# Loggers whose WARNING+ output is library-internal cruft, not signal worth
# burning Sentry quota on. Events whose ``logger`` field starts with any of
# these prefixes are dropped via ``before_send`` before transport. Keep
# this list narrow and intentional — the goal is dropping known noise, not
# blanket-suppressing third-party libraries.
#
# - googleapiclient: emits an INFO/WARNING line every time it auto-refreshes
#   a 401-expired token ("Refreshing credentials due to a 401 response.
#   Attempt 1/2.") and a deprecation WARNING for ``file_cache is only
#   supported with oauth2client<4.0.0`` on every Gmail API client construction.
#   Both are normal library behaviour, not actionable signal.
# - google.auth: same family — refresh-token / metadata-server logs.
_NOISE_LOGGER_PREFIXES = (
    "googleapiclient",
    "google.auth",
)


def _drop_known_noise(
    event: dict[str, Any], _hint: dict[str, Any],
) -> dict[str, Any] | None:
    """Sentry ``before_send`` hook — drop events from known-noisy loggers.

    Returning ``None`` causes the SDK to discard the event before transport.
    Only filters log-record events from the noise allowlist above; uncaught
    exceptions and explicit ``capture_*`` calls are unaffected.
    """
    logger_name = event.get("logger") or ""
    if any(logger_name.startswith(prefix) for prefix in _NOISE_LOGGER_PREFIXES):
        return None
    return event


class SentryNotConfiguredError(RuntimeError):
    """Raised at boot when ``SENTRY_DSN`` is missing in a production environment.

    Distinct from a transient network outage: this is a deployment-time fault
    that should crash the app immediately so the healthcheck catches it.
    """


def init_sentry(*, dsn: str, environment: str) -> None:
    """Initialise the Sentry SDK.

    Args:
        dsn: The Sentry project DSN. Empty string disables Sentry in
            non-production environments and raises in production.
        environment: The deployment environment name. ``"production"``
            triggers fail-loud DSN enforcement; any other value lets an
            empty DSN slide as no-op.

    Raises:
        SentryNotConfiguredError: If ``environment="production"`` and
            ``dsn`` is empty.
    """
    if not dsn:
        if environment == _PROD_ENV:
            raise SentryNotConfiguredError(
                "SENTRY_DSN is required in production. "
                "Set the SENTRY_DSN environment variable or set "
                "ENVIRONMENT to 'development' / 'test' to skip Sentry."
            )
        # Non-production: Sentry is optional — skip silently.
        return

    # LoggingIntegration:
    # - level=INFO         → INFO+ logs ride along as breadcrumbs on
    #                        later events (debug context).
    # - event_level=WARNING → only WARNING+ logs become standalone
    #                        Sentry events.
    #
    # Was previously event_level=INFO, which forwarded every /health
    # request log as its own Sentry event. That blew through the
    # project's quota (~36h before 2026-05-06 18:00 UTC) and silently
    # rate-limited ALL subsequent events — including the warning
    # captures we rely on for missing-storage observability.
    # WARNING+ is the correct ceiling: loud enough that orphan-storage,
    # boot-guard, and silent-fail warnings reach Sentry; quiet enough
    # that request-log noise doesn't burn the quota.
    logging_integration = LoggingIntegration(
        level=logging.INFO,
        event_level=logging.WARNING,
    )

    try:
        sentry_sdk.init(
            dsn=dsn,
            send_default_pii=False,
            traces_sample_rate=0.1,
            environment=environment,
            integrations=[logging_integration],
            before_send=_drop_known_noise,
        )
    except Exception:
        logger.warning(
            "Sentry initialisation failed — error reporting will be unavailable.",
            exc_info=True,
        )
        raise
