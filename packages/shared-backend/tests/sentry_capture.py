"""The real Sentry SDK, configured by ``init_sentry``, sending to memory."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from unittest.mock import patch

import sentry_sdk
from sentry_sdk.envelope import Envelope
from sentry_sdk.transport import Transport
from sentry_sdk.types import Event

from platform_shared.core.observability import init_sentry
from tests.sent_log import SentLog

_DSN = "https://public@example.invalid/1"


class CapturingTransport(Transport):
    """Keeps every envelope the SDK would have sent."""

    def __init__(self, options: dict[str, object] | None = None) -> None:
        super().__init__(options)
        self.envelopes: list[Envelope] = []

    def capture_envelope(self, envelope: Envelope) -> None:
        self.envelopes.append(envelope)


@contextmanager
def captured_sentry() -> Iterator[CapturingTransport]:
    """``init_sentry``'s configuration with an in-memory transport, in a fresh scope.

    Two options are added to what ``init_sentry`` passes. ``enable_logs`` opens
    the Sentry Logs channel, which production keeps closed for now, so its hook
    is exercised too. ``default_integrations=False`` stops the SDK patching
    libraries for the rest of the test session; none of those integrations
    reach a database error's text. Call ``sentry_sdk.flush()`` before reading
    the envelopes: logs are sent in batches.
    """
    real_init = sentry_sdk.init

    def init_capturing(**options: object) -> object:
        return real_init(
            **options,
            transport=CapturingTransport,
            default_integrations=False,
            enable_logs=True,
        )

    with patch.object(sentry_sdk, "init", init_capturing):
        init_sentry(dsn=_DSN, environment="test")
    client = sentry_sdk.get_client()
    transport = client.transport
    assert isinstance(transport, CapturingTransport)
    try:
        with sentry_sdk.isolation_scope() as scope:
            scope.clear_breadcrumbs()
            yield transport
    finally:
        client.close()
        sentry_sdk.get_global_scope().set_client(None)


def sent_bytes(transport: CapturingTransport) -> bytes:
    """Everything sent, as it would have gone over the wire."""
    return b"".join(envelope.serialize() for envelope in transport.envelopes)


def sent_events(transport: CapturingTransport) -> list[Event]:
    return [
        item.payload.json
        for envelope in transport.envelopes
        for item in envelope.items
        if item.type == "event"
    ]


def sent_logs(transport: CapturingTransport) -> list[SentLog]:
    """The Sentry logs sent, in order (they travel in batches, several per item)."""
    return [
        log
        for envelope in transport.envelopes
        for item in envelope.items
        if item.type == "log"
        for log in item.payload.json["items"]
    ]
