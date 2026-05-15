"""Unit tests for the order-ready SMS body renderer."""
from __future__ import annotations

from datetime import time

from app.services.sms.order_ready_notification import render_order_ready_body


def test_renders_first_name_only() -> None:
    body = render_order_ready_body(
        customer_name="Jonathan Castillo",
        drop_name="Dec 25th",
        pickup_time=time(12, 30),
    )
    assert body.startswith("Hi Jonathan,")
    # last name should not appear in the segment
    assert "Castillo" not in body


def test_renders_drop_name_and_pickup_time() -> None:
    body = render_order_ready_body(
        customer_name="Maria",
        drop_name="Desmadre Pizza Drop",
        pickup_time=time(13, 0),
    )
    assert "Desmadre Pizza Drop" in body
    assert "13:00" in body


def test_handles_empty_customer_name() -> None:
    body = render_order_ready_body(
        customer_name="",
        drop_name="Dec 25th",
        pickup_time=time(12, 0),
    )
    assert "Hi there," in body


def test_handles_missing_pickup_time() -> None:
    body = render_order_ready_body(
        customer_name="Maria",
        drop_name="Dec 25th",
        pickup_time=None,
    )
    # No Slot: prefix when pickup_time is missing
    assert "Slot:" not in body
    assert "Hi Maria," in body
    assert "Dec 25th" in body


def test_body_fits_single_sms_segment() -> None:
    """A common case should fit one 160-char SMS segment so Twilio
    bills one segment per ready-text rather than two."""
    body = render_order_ready_body(
        customer_name="Jonathan",
        drop_name="Dec 25th Drop",
        pickup_time=time(12, 30),
    )
    assert len(body) <= 160
