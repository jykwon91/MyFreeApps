"""Sentry initialisation with fail-loud production enforcement.

In production (``ENVIRONMENT=production``), a missing ``SENTRY_DSN`` is a
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

from app.core.config import settings

logger = logging.getLogger(__name__)


class SentryNotConfiguredError(RuntimeError):
    """Raised at boot when ``SENTRY_DSN`` is missing in a production environment.

    Distinct from a transient network outage: this is a deployment-time fault
    that should crash the app immediately so the healthcheck catches it.
    """


def init_sentry() -> None:
    """Initialise the Sentry SDK.

    Raises:
        SentryNotConfiguredError: If ``ENVIRONMENT=production`` and
            ``SENTRY_DSN`` is not set.
    """
    if not settings.sentry_dsn:
        if settings.environment == "production":
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
            dsn=settings.sentry_dsn,
            send_default_pii=False,
            traces_sample_rate=0.1,
            environment=settings.environment,
            integrations=[logging_integration],
        )
    except Exception:
        logger.warning(
            "Sentry initialisation failed — error reporting will be unavailable.",
            exc_info=True,
        )
        raise
