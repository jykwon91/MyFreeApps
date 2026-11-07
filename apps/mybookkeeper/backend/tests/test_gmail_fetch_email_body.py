"""fetch_email_body records the date Gmail received the message."""
from __future__ import annotations

from unittest.mock import MagicMock

from app.services.email.gmail_service import fetch_email_body


def _service_returning(detail: dict) -> MagicMock:
    service = MagicMock()
    service.users().messages().get().execute.return_value = detail
    return service


def test_sent_on_is_the_utc_date_of_internal_date() -> None:
    # 2026-12-31T23:30:00Z: still New Year's Eve in UTC.
    detail = {
        "internalDate": "1798759800000",
        "payload": {
            "headers": [
                {"name": "Subject", "value": "Reservation confirmed"},
                {"name": "From", "value": "automated@airbnb.com"},
            ],
            "mimeType": "text/plain",
            "body": {"data": ""},
        },
    }

    data = fetch_email_body(_service_returning(detail), "msg-1")

    assert data["sent_on"] == "2026-12-31"
    assert data["subject"] == "Reservation confirmed"
    assert data["from_address"] == "automated@airbnb.com"
