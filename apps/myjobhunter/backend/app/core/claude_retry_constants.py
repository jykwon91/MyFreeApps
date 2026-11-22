"""Retry budgets for Claude calls, by who is waiting on the answer.

Only the shared 429 backoff retries: the Anthropic client is built with SDK
``max_retries`` 0 so its own retries don't multiply the backoff's attempts.
"""
from __future__ import annotations

from app.core.claude_retry_policy import ClaudeRetryPolicy

CLAUDE_SDK_MAX_RETRIES = 0

# A user is waiting on the HTTP request (parse-jd, extract-from-url, job
# analysis, company research, a refinement turn). Retry a 429 only when
# Anthropic asks for a short wait; otherwise fail fast so the route answers
# "busy, try again" with Retry-After instead of spinning for minutes.
REQUEST_PATH_CLAUDE_RETRY = ClaudeRetryPolicy(max_attempts=2, max_wait_seconds=10.0)

# A background worker is waiting (resume parse, refinement preparation,
# discovery scoring). Nobody is watching a spinner, so wait the rate limit out.
WORKER_CLAUDE_RETRY = ClaudeRetryPolicy(max_attempts=5, max_wait_seconds=None)
