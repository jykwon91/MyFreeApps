"""The company research-run claim: how long it stands, and which columns it writes."""
from __future__ import annotations

from datetime import timedelta

# Longer than the slowest real run: two parallel 30 s Tavily searches, then a
# Claude call (120 s timeout) whose 429 backoff can wait 60+120+240+480 s across
# five attempts. A run that finishes or fails clears its own claim; this only
# frees a company whose run died with its process.
COMPANY_RESEARCH_CLAIM_LEASE = timedelta(minutes=30)

# Columns whose change is not an edit to the company: the claim is lease state,
# and updated_at is the stamp itself. A write touching only these keeps updated_at.
COMPANY_NON_EDIT_COLUMNS: frozenset[str] = frozenset({"research_started_at", "updated_at"})
