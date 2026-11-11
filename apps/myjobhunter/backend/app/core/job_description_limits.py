"""Length limit for pasted job-description text.

Single source for every request schema that accepts a job description, kept
in step with ``JD_TEXT_MAX_LENGTH`` in the api-client, so a value one surface
accepts is never rejected by another.
"""
from __future__ import annotations

JD_TEXT_MAX_LEN = 50_000
