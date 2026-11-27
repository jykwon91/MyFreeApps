"""Render the reminder a tenant receives. Pure — no DB, no clock.

    Hi Sonu, reminder: rent of $375 is due tomorrow (Sunday). Pay via Zelle jason@example.com. - Jason, your landlord

The due-date phrase is relative to the day the reminder is *sent* ("today",
"tomorrow", otherwise "on Sunday, Nov 1"), so a reminder that goes out late
still reads correctly. The same text is used for email and SMS; texts
also get ``SMS_OPT_OUT_SUFFIX`` appended when they are sent.

Texts come from a Twilio number the tenant doesn't know, so the message is
signed with the operator's first name. The sign-off uses a plain hyphen, not a
dash: one character outside the GSM-7 alphabet makes the whole text UCS-2,
which carriers bill as 70 characters a segment instead of 160.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

_FALLBACK_GREETING_NAME = "there"
_SIGN_OFF_ROLE = "your landlord"


def first_name(legal_name: str | None) -> str:
    parts = (legal_name or "").split()
    return parts[0] if parts else _FALLBACK_GREETING_NAME


def sign_off(sender_name: str | None) -> str:
    """`` - Jason, your landlord``, or `` - Your landlord`` without a name."""
    parts = (sender_name or "").split()
    if not parts:
        return f" - {_SIGN_OFF_ROLE.capitalize()}"
    return f" - {parts[0]}, {_SIGN_OFF_ROLE}"


def format_amount(amount: Decimal) -> str:
    """``$375`` for whole dollars, ``$411.29`` otherwise, thousands separated."""
    if amount == amount.to_integral_value():
        return f"${int(amount):,}"
    return f"${amount:,.2f}"


def _short_date(day: _dt.date) -> str:
    # ``%-d`` is glibc-only and raises on Windows, so strip the zero by hand.
    return f"{day.strftime('%b')} {day.day}"


def due_phrase(due_date: _dt.date, sent_on: _dt.date) -> str:
    weekday = due_date.strftime("%A")
    days_out = (due_date - sent_on).days
    if days_out == 0:
        return f"today ({weekday})"
    if days_out == 1:
        return f"tomorrow ({weekday})"
    return f"on {weekday}, {_short_date(due_date)}"


def render_reminder(
    *,
    tenant_legal_name: str | None,
    amount: Decimal,
    due_date: _dt.date,
    sent_on: _dt.date,
    payment_instructions: str | None,
    sender_name: str | None,
) -> str:
    message = (
        f"Hi {first_name(tenant_legal_name)}, reminder: rent of "
        f"{format_amount(amount)} is due {due_phrase(due_date, sent_on)}."
    )
    instructions = (payment_instructions or "").strip()
    if instructions:
        message += f" Pay via {instructions.rstrip('.')}."
    return message + sign_off(sender_name)


def reminder_subject(amount: Decimal, due_date: _dt.date) -> str:
    return (
        f"Rent reminder: {format_amount(amount)} due "
        f"{due_date.strftime('%A')}, {_short_date(due_date)}"
    )
