"""The views ``GET /discover`` can list — the allowlist for ``?state=``.

- ``inbox``: postings still to triage.
- ``saved``: postings kept for later.
- ``dismissed``: postings the user dismissed, which Restore returns to the inbox.
- ``all``: every row, expired and closed ones included.
"""
from __future__ import annotations

from typing import Literal

DiscoveredJobState = Literal["inbox", "saved", "dismissed", "all"]
