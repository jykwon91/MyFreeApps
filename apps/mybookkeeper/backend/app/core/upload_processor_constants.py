"""Tunables for the upload processor worker (``app/workers/upload_processor_worker.py``).

Imports no settings: ``app/workers/upload_processor_healthcheck.py`` reads
these and must not be able to fail for reasons unrelated to the worker.
"""
import tempfile
from pathlib import Path
from typing import Final

POLL_INTERVAL_SECONDS: Final = 2
MAX_CONCURRENT_USERS: Final = 5
MAX_RETRIES: Final = 3

# The poll loop touches this after every successful look for work and after
# every document it finishes, so it only goes stale when the loop stops
# making progress.
HEARTBEAT_PATH: Final = Path(tempfile.gettempdir()) / "mbk-upload-processor-heartbeat"

# Headroom over one extraction (EXTRACTION_TIMEOUT_SECONDS) for the claim and
# status-update DB round trips around it.
HEARTBEAT_EXTRACTION_HEADROOM_SECONDS: Final = 120

# A busy loop beats once per finished document, so the heartbeat may
# legitimately be one extraction (claude_timeout_seconds + 30 = 630s by
# default) plus the headroom above old. 15 minutes leaves room over the
# default; the worker refuses to boot if CLAUDE_TIMEOUT_SECONDS is raised
# past it (``app/core/upload_processor_guard.py``), since the healthcheck
# would then flag a healthy worker mid-extraction.
HEARTBEAT_MAX_AGE_SECONDS: Final = 15 * 60
