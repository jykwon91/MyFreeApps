"""Fakes for the one Gmail send POST every outgoing email goes through."""
from __future__ import annotations

import base64
import email
import json
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from email.message import Message
from typing import Any
from unittest.mock import patch

import requests
from google.oauth2.credentials import Credentials

from app.services.email import gmail_request_executor


def gmail_response(status: int, payload: Any) -> requests.Response:
    response = requests.Response()
    response.status_code = status
    response._content = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    return response


class GmailPostRecorder:
    def __init__(self) -> None:
        self.raws: list[str] = []
        self.creds: list[Credentials] = []

    def message(self, index: int = -1) -> Message:
        return email.message_from_bytes(base64.urlsafe_b64decode(self.raws[index] + "==="))


@contextmanager
def fake_gmail_post(
    outcome: requests.Response | BaseException,
    *,
    on_post: Callable[[Credentials], None] | None = None,
) -> Iterator[GmailPostRecorder]:
    """Replace the send POST with ``outcome`` (returned, or raised)."""
    recorder = GmailPostRecorder()

    def _post(creds: Credentials, raw: str) -> requests.Response:
        recorder.raws.append(raw)
        recorder.creds.append(creds)
        if on_post is not None:
            on_post(creds)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    with patch.object(gmail_request_executor, "post_message_send", _post):
        yield recorder
