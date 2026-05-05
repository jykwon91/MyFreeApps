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

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

logger = logging.getLogger(__name__)

_PROD_ENV = "production"


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

    # LoggingIntegration: capture INFO+ as breadcrumbs (attached to any
    # subsequent error event for context), and INFO+ as standalone events
    # so diagnostic logs are visible in Sentry without exposing a debug API.
    # The breadcrumb level controls what rides on errors; the event level
    # controls what gets posted as its own Sentry event.
    logging_integration = LoggingIntegration(
        level=logging.INFO,
        event_level=logging.INFO,
    )

    try:
        sentry_sdk.init(
            dsn=dsn,
            send_default_pii=False,
            traces_sample_rate=0.1,
            environment=environment,
            integrations=[logging_integration],
        )
    except Exception:
        logger.warning(
            "Sentry initialisation failed — error reporting will be unavailable.",
            exc_info=True,
        )
        raise
