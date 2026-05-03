"""RentSpree screening provider — redirect-only.

Mirrors ``keycheck_provider.py`` exactly in shape (same ScreeningProvider
Protocol). RentSpree hosts are redirected to their RentSpree dashboard where
they initiate a screening for the applicant. After the applicant completes
the screening, the host downloads the report PDF and uploads it via the
upload endpoint.

The dashboard URL is read from ``RENTSPREE_DASHBOARD_URL`` at call time with
a sensible default. Set the env var to override (e.g., a custom RentSpree
tenant URL, or a mock URL in tests).
"""
from __future__ import annotations

import os

DEFAULT_RENTSPREE_DASHBOARD_URL: str = "https://app.rentspree.com/property-manager"


class RentSpreeProvider:
    """Static-config provider — no per-applicant URL at this tier.

    Implements the ``ScreeningProvider`` Protocol structurally (no inherit).
    """

    name: str = "rentspree"

    def dashboard_url(self) -> str:
        """Return the URL the host should be redirected to.

        Reads ``RENTSPREE_DASHBOARD_URL`` at call time (not import time) so
        the env var can be set after the module is loaded — useful for tests
        that monkey-patch the environment between cases.
        """
        return os.environ.get(
            "RENTSPREE_DASHBOARD_URL",
            DEFAULT_RENTSPREE_DASHBOARD_URL,
        ).strip() or DEFAULT_RENTSPREE_DASHBOARD_URL
