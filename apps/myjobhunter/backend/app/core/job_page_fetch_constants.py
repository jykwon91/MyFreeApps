"""Limits for fetching a job-posting page from a user-supplied URL."""
from __future__ import annotations

from typing import Final

# Seconds for any single phase (connect, one read, ...).
JOB_PAGE_PHASE_TIMEOUT_SECONDS: Final = 15.0

# Seconds for the whole fetch, redirects and body included. The user is
# waiting on this, and a server dripping bytes just inside the phase timeout
# would otherwise hold the request open indefinitely.
JOB_PAGE_TOTAL_TIMEOUT_SECONDS: Final = 20.0

# Largest page read, bounding memory and Claude input tokens. Every
# legitimate posting fits; the read stops as soon as a body passes this.
JOB_PAGE_MAX_BYTES: Final = 2_000_000

# Redirect hops followed. Enough for ATS chains (http to https, trailing
# slash, vanity host to real host).
JOB_PAGE_MAX_REDIRECTS: Final = 5
