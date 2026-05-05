"""MyJobHunter Sentry init wrapper.

The actual SDK init logic lives in
``platform_shared.core.observability`` so all MyFreeApps apps share the
same fail-loud-in-prod enforcement. This module wires app-local settings
into the shared init so callers don't need to thread ``settings``
through every call site.
"""

from platform_shared.core.observability import (
    SentryNotConfiguredError,
    init_sentry as _init_sentry,
)

from app.core.config import settings

__all__ = ["SentryNotConfiguredError", "init_sentry"]


def init_sentry() -> None:
    _init_sentry(dsn=settings.sentry_dsn, environment=settings.environment)
