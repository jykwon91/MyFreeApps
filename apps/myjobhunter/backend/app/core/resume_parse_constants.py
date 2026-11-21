"""Retry budget for the resume parser worker.

A job that fails for a reason that clears on its own (Claude busy or
unreachable, a timeout) goes back on the queue after
``RESUME_PARSE_RETRY_BASE_SECONDS * 2**retry`` seconds, until it has been
retried ``RESUME_PARSE_MAX_RETRIES`` times; then it is marked failed.
"""
from __future__ import annotations

RESUME_PARSE_MAX_RETRIES = 5
RESUME_PARSE_RETRY_BASE_SECONDS = 60
