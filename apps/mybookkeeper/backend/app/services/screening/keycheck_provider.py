"""KeyCheck screening provider — redirect-only.

At our scale (2-room operator) the RentSpree API tier doesn't justify the
complexity, and KeyCheck has no real public API at this tier anyway. The
only viable integration shape is "redirect host out to KeyCheck, then have
host upload the result PDF + status."

This module implements ``ScreeningProvider`` for KeyCheck. The dashboard
URL is read from the ``KEYCHECK_DASHBOARD_URL`` env var with a sensible
default that points at the public KeyCheck dashboard. Hosts who use a
different KeyCheck tenant URL override the env var without code changes.
"""
from __future__ import annotations

import os

# KeyCheck's public dashboard. Hosts redirect into this and authenticate
# with their existing KeyCheck account. We never see their credentials.
DEFAULT_KEYCHECK_DASHBOARD_URL: str = "https://www.keycheck.com/dashboard"


class KeyCheckProvider:
    """Static-config provider — no per-applicant URL because KeyCheck doesn't
    expose a per-screening intent URL at this tier.

    Implements the ``ScreeningProvider`` Protocol structurally (no inherit).
    """

    name: str = "keycheck"

    def dashboard_url(self) -> str:
        """Return the URL the host should be redirected to.

        Reads ``KEYCHECK_DASHBOARD_URL`` at call time (not import time) so
        the env var can be set after the module is loaded — useful for
        tests that monkey-patch the environment between cases.
        """
        return os.environ.get(
            "KEYCHECK_DASHBOARD_URL",
            DEFAULT_KEYCHECK_DASHBOARD_URL,
        ).strip() or DEFAULT_KEYCHECK_DASHBOARD_URL
