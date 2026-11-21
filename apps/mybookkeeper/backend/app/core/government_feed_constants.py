"""Constants shared by the government data feeds (PMMS, Power to Choose, TDI).

A feed that is down tends to stay down for minutes, not milliseconds. Without
remembering the failure, every page view re-pays the full timeout/retry bill
before showing "unavailable".
"""

# How long a failed fetch is remembered. Short enough that a recovered feed is
# picked up within a minute, long enough that a burst of page views during an
# outage shares a single failed attempt.
FEED_FAILURE_CACHE_TTL_SECONDS: float = 60.0

# Hard ceiling on one feed fetch end to end (all attempts, backoff included).
# httpx timeouts apply per connect/read phase, so on their own they cannot bound
# the total wait.
FEED_TOTAL_DEADLINE_SECONDS: float = 20.0
