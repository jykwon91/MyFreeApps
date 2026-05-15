"""Renders the ready-to-pick-up SMS body for a customer order.

Kept tiny on purpose — Twilio bills per SMS *segment* (160 ASCII chars
or ~70 unicode chars per segment), so the body is one segment for the
common case. The operator can extend the template later if a longer
pickup-instructions block is needed; for now the customer already knows
the pickup location from the original confirmation page.
"""
from __future__ import annotations

from datetime import time as _time


def render_order_ready_body(
    *,
    customer_name: str,
    drop_name: str,
    pickup_time: _time | None,
) -> str:
    """Build the SMS body for an order-ready notification.

    The first-name-only address keeps the segment under 160 chars while
    still feeling personal. Pickup time is formatted as HH:MM so the
    customer doesn't need to do timezone math.
    """
    first_name = customer_name.strip().split(" ", 1)[0] if customer_name else "there"
    if pickup_time is not None:
        pickup_str = f" Slot: {pickup_time.strftime('%H:%M')}."
    else:
        pickup_str = ""
    return (
        f"Hi {first_name}, your pizza is ready to pick up at {drop_name}!"
        f"{pickup_str} See you soon."
    )
