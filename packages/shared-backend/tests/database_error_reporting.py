"""Every way app code hands a caught database error to Sentry, and what was sent."""

from __future__ import annotations

from typing import Final

import sentry_sdk
from sqlalchemy.exc import DBAPIError

from platform_shared.core.logging_safety import install_crlf_safe_logging
from tests.database_error_samples import PROBE_FRAGMENTS
from tests.probe_logger import probe_logger
from tests.sentry_capture import (
    CapturingTransport,
    captured_sentry,
    sent_bytes,
    sent_events,
    sent_logs,
)

# An event per WARNING+ log call and per capture call; a Sentry log per log call.
_EVENTS_PER_REPORT: Final = 8
_LOGS_PER_REPORT: Final = 7


def report_every_way(error: DBAPIError) -> CapturingTransport:
    """Send ``error`` through ``init_sentry``'s configuration and return what was sent.

    In order:

    1. ``capture_exception``;
    while ``error`` is being handled:
    2. ``logger.exception("Saving the user failed")``;
    3. ``logger.warning("Saving the user failed: %s", error)``;
    4. the same through a logger whose handler has the CRLF filter, which
       escapes the handler's copy of the record and leaves Sentry's as it was;
    5. ``logger.info("Retrying after: %s", error)``, a breadcrumb and a log only;
    once it no longer is:
    6. call 3 again;
    7. call 4 again;
    8. ``logger.warning(f"Saving the user failed: {error}")``;
    9. ``capture_message("after the failure")``, which carries the breadcrumbs.

    Checks that every event and log went out: a hook that raised would drop
    its report silently, and a report that never left can't be checked.
    """
    with (
        captured_sentry() as transport,
        probe_logger("app.probe") as logger,
        probe_logger("app.probe_crlf") as crlf_logger,
    ):
        install_crlf_safe_logging(crlf_logger)
        sentry_sdk.capture_exception(error)
        try:
            raise error
        except DBAPIError:
            logger.exception("Saving the user failed")
            logger.warning("Saving the user failed: %s", error)
            crlf_logger.warning("Saving the user failed: %s", error)
            logger.info("Retrying after: %s", error)
        logger.warning("Saving the user failed: %s", error)
        crlf_logger.warning("Saving the user failed: %s", error)
        logger.warning(f"Saving the user failed: {error}")
        sentry_sdk.capture_message("after the failure")
        sentry_sdk.flush()
    assert len(sent_events(transport)) == _EVENTS_PER_REPORT
    assert len(sent_logs(transport)) == _LOGS_PER_REPORT
    return transport


def assert_probe_value_not_sent(transport: CapturingTransport) -> None:
    """No part of the fake address in anything sent.

    Serialises every envelope as the real transport does, so this also fails
    if a hook left something in an event that can't be sent.
    """
    sent = sent_bytes(transport).decode()
    assert [fragment for fragment in PROBE_FRAGMENTS if fragment in sent] == []
