"""How long a company's research-run claim stands before it counts as abandoned."""
from __future__ import annotations

from datetime import timedelta

# Longer than the slowest real run: two parallel 30 s Tavily searches, then a
# Claude call (120 s timeout) whose 429 backoff can wait 60+120+240+480 s across
# five attempts. A run that finishes or fails clears its own claim; this only
# frees a company whose run died with its process.
COMPANY_RESEARCH_CLAIM_LEASE = timedelta(minutes=30)
