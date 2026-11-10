"""Boot guard: the upload processor's heartbeat must outlast one extraction."""
from app.core.upload_heartbeat_too_short_error import UploadHeartbeatTooShortError
from app.core.upload_processor_constants import (
    HEARTBEAT_EXTRACTION_HEADROOM_SECONDS,
    HEARTBEAT_MAX_AGE_SECONDS,
)


def check_heartbeat_outlasts_extraction(extraction_timeout_seconds: float) -> None:
    """Fail loud when one extraction plus headroom exceeds the heartbeat max age.

    The busy poll loop beats once per finished document, so an extraction
    allowed to run longer than the healthcheck's max age would mark a healthy
    worker unhealthy. The max age is a constant (the healthcheck imports no
    settings) while the timeout follows ``CLAUDE_TIMEOUT_SECONDS``, so the
    two are reconciled here, at boot.
    """
    needed = extraction_timeout_seconds + HEARTBEAT_EXTRACTION_HEADROOM_SECONDS
    if needed > HEARTBEAT_MAX_AGE_SECONDS:
        raise UploadHeartbeatTooShortError(
            f"One extraction can take {extraction_timeout_seconds:.0f}s "
            f"(CLAUDE_TIMEOUT_SECONDS + 30) plus {HEARTBEAT_EXTRACTION_HEADROOM_SECONDS}s "
            f"of DB headroom = {needed:.0f}s, longer than the upload processor's "
            f"{HEARTBEAT_MAX_AGE_SECONDS}s heartbeat max age. Lower CLAUDE_TIMEOUT_SECONDS "
            f"in apps/mybookkeeper/backend/.env.docker to at most "
            f"{HEARTBEAT_MAX_AGE_SECONDS - HEARTBEAT_EXTRACTION_HEADROOM_SECONDS - 30}, "
            f"or raise HEARTBEAT_MAX_AGE_SECONDS in app/core/upload_processor_constants.py.",
        )
