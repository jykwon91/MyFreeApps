"""Keep secret URLs out of httpx's own request log.

httpx logs ``HTTP Request: GET <full URL> "HTTP/1.1 200 OK"`` at INFO for every
request it sends, each redirect hop included. Some URLs are secrets: a private
calendar feed link fetched through
:func:`~platform_shared.core.capped_fetch.fetch_capped` is a bearer credential,
and a Discord interaction webhook path carries the interaction token. The apps
log at INFO, so that line would write the secret to the logs and to Sentry
breadcrumbs. While ``hide_request_urls`` is set, this filter swaps the URL in
those records for its host. Other httpx traffic is logged unchanged.

Importing this module installs the filter on the httpx logger, once.
"""
from __future__ import annotations

import logging
from contextvars import ContextVar

import httpx

from platform_shared.core.capped_fetch_constants import HTTPX_LOGGER_NAME
from platform_shared.core.url_host import url_host

__all__ = ["HostOnlyRequestLogFilter", "hide_request_urls"]

# Set for the duration of one request (or one capped fetch). A context variable, so a
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


logging.getLogger(HTTPX_LOGGER_NAME).addFilter(HostOnlyRequestLogFilter())
