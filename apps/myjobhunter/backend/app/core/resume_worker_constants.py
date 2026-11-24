"""Liveness tunables for the resume worker (``app/workers/resume_parser_worker.py``).

Imports no settings: ``app/workers/resume_parser_healthcheck.py`` reads these
and must not be able to fail for reasons unrelated to the worker.
"""
import tempfile
from pathlib import Path
from typing import Final

# A parse or refinement prepare waits out Anthropic rate limits with no time
# cap (WORKER_CLAUDE_RETRY), so the heartbeat is not tied to finished steps:
# a background task touches it this often for as long as the process and its
# event loop are alive. It reports liveness only; a failed step goes to the
# logs and Sentry.
HEARTBEAT_INTERVAL_SECONDS: Final = 30

# Stale after this long means the worker is dead or its event loop has been
# blocked for minutes, never that it is idle or mid-step. Six missed beats, so
# a briefly blocking call (text extraction from a large PDF) can't flap it.
HEARTBEAT_MAX_AGE_SECONDS: Final = HEARTBEAT_INTERVAL_SECONDS * 6

HEARTBEAT_PATH: Final = Path(tempfile.gettempdir()) / "mjh-resume-worker-heartbeat"
