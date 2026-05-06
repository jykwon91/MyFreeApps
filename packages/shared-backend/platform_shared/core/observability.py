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
        )
    except Exception:
        logger.warning(
            "Sentry initialisation failed — error reporting will be unavailable.",
            exc_info=True,
        )
        raise
