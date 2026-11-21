"""Keep the full URL out of httpx's own request log during a capped fetch.

httpx logs ``HTTP Request: GET <full URL> "HTTP/1.1 200 OK"`` at INFO for every
request it sends, each redirect hop included. A URL fetched through
:func:`~platform_shared.core.capped_fetch.fetch_capped` may be a secret (a
private calendar feed link is a bearer credential) and the apps log at INFO,
so that line would write the secret to the logs and to Sentry breadcrumbs.
While a capped fetch runs, this filter swaps the URL in those records for its
host. Other httpx traffic is logged unchanged.
"""
from __future__ import annotations

import logging
from contextvars import ContextVar

import httpx

from platform_shared.core.url_host import url_host

__all__ = ["HostOnlyRequestLogFilter", "hide_request_urls"]

# Set by fetch_capped for the duration of one fetch. A context variable, so a
# concurrent fetch in another task never changes what this task logs.
hide_request_urls: ContextVar[bool] = ContextVar("hide_request_urls", default=False)


class HostOnlyRequestLogFilter(logging.Filter):
    """Replace every ``httpx.URL`` argument of a record with its host."""

    def filter(self, record: logging.LogRecord) -> bool:
        if hide_request_urls.get() and isinstance(record.args, tuple):
            record.args = tuple(
                url_host(str(arg)) if isinstance(arg, httpx.URL) else arg
                for arg in record.args
            )
        return True
