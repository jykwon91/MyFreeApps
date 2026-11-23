"""Errors the discovery fetch service raises, mapped to HTTP statuses by the refresh route.

Kept apart from ``discovery_fetch_service`` so modules it imports can name
them without an import cycle.
"""


class DiscoveryFetchError(RuntimeError):
    """Generic fetch failure — HTTP 502."""


class DiscoverySourceNotFoundError(DiscoveryFetchError):
    """Source ID doesn't exist or doesn't belong to caller — HTTP 404."""


class DiscoverySourceInactiveError(DiscoveryFetchError):
    """Source is deactivated — HTTP 409."""


class DiscoveryUnsupportedSourceError(DiscoveryFetchError):
    """No adapter registered for this source kind — HTTP 501."""


class DiscoverySourceMissingQueryError(DiscoveryFetchError):
    """A JSearch saved search has neither a query nor any roles — HTTP 502."""
