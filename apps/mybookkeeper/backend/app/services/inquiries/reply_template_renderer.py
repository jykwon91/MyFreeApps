"""Pure variable-substitution renderer for reply templates.

This module is intentionally side-effect free — no DB access, no I/O — so it
can be unit-tested in isolation and the frontend can hold an equivalent
substitution function for live preview without round-tripping the API on
every keystroke.

Variables are listed in ``app.core.inquiry_enums.REPLY_TEMPLATE_VARIABLES``.
Substitution is longest-key-first to prevent ``$name`` from matching part of
``$host_name``.

Per RENTALS_PLAN.md §9.3, when the linked listing has
``pets_on_premises = True`` and a ``large_dog_disclosure`` text is set,
that disclosure is auto-prepended to the rendered body. The host should
never have to remember to mention the dog.
"""
from __future__ import annotations

import datetime as _dt

from app.core.inquiry_enums import REPLY_TEMPLATE_VARIABLES

# Sanitization caps — values longer than these are truncated. The caps are
# generous (a person's name is rarely 100 chars) but bounded so a malicious
# inquirer can't blow up the message size.
_MAX_NAME = 100
_MAX_LISTING = 200
_MAX_EMPLOYER = 200
_MAX_HOST_NAME = 100
_MAX_HOST_PHONE = 50

_FALLBACK_NAME = "there"
_FALLBACK_LISTING = "the room"
_FALLBACK_DATES_BOTH = "your requested dates"
_FALLBACK_START_DATE = "the start date you requested"
_FALLBACK_END_DATE = "the end date you requested"


def _sanitize(value: str | None, max_length: int) -> str:
    """Strip whitespace and cap length. Empty / None returns empty string."""
    if not value:
        return ""
    cleaned = value.strip()
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length]
    return cleaned


def _format_date(value: _dt.date) -> str:
    """Render a date as 'Jun 1, 2026' — same convention as the frontend's
    ``formatLongDate`` helper so previews match exactly."""
    return value.strftime("%b ") + str(value.day) + value.strftime(", %Y")


def _format_dates(
    start: _dt.date | None, end: _dt.date | None,
) -> str:
    """Render the ``$dates`` variable. Both null → fallback phrase."""
    if start is None and end is None:
        return _FALLBACK_DATES_BOTH
    if start is None:
        # Only end is known.
        return f"until {_format_date(end)}"  # type: ignore[arg-type]
    if end is None:
        return f"starting {_format_date(start)}"
    return f"{_format_date(start)} to {_format_date(end)}"


def _build_substitutions(
    *,
    inquirer_name: str | None,
    inquirer_employer: str | None,
    listing_title: str | None,
    desired_start_date: _dt.date | None,
    desired_end_date: _dt.date | None,
    host_name: str,
    host_phone: str | None,
) -> dict[str, str]:
    """Build the variable → substitution mapping with sanitization applied."""
    name = _sanitize(inquirer_name, _MAX_NAME) or _FALLBACK_NAME
    listing = _sanitize(listing_title, _MAX_LISTING) or _FALLBACK_LISTING
    employer = _sanitize(inquirer_employer, _MAX_EMPLOYER)
    sanitized_host_name = _sanitize(host_name, _MAX_HOST_NAME)
    sanitized_host_phone = _sanitize(host_phone, _MAX_HOST_PHONE)

    start_date_str = (
        _format_date(desired_start_date)
        if desired_start_date is not None
        else _FALLBACK_START_DATE
    )
    end_date_str = (
        _format_date(desired_end_date)
        if desired_end_date is not None
        else _FALLBACK_END_DATE
    )
    dates_str = _format_dates(desired_start_date, desired_end_date)

    return {
        "$name": name,
        "$listing": listing,
        "$dates": dates_str,
        "$start_date": start_date_str,
        "$end_date": end_date_str,
        "$employer": employer,
        "$host_name": sanitized_host_name,
        "$host_phone": sanitized_host_phone,
    }


def _substitute(text: str, substitutions: dict[str, str]) -> str:
    """Apply substitutions, longest variable first to avoid prefix collision."""
    keys_longest_first = sorted(substitutions.keys(), key=len, reverse=True)
    rendered = text
    for key in keys_longest_first:
        rendered = rendered.replace(key, substitutions[key])
    return rendered


def render_template(
    *,
    template_subject: str,
    template_body: str,
    inquirer_name: str | None,
    inquirer_employer: str | None,
    listing_title: str | None,
    listing_pets_on_premises: bool,
    listing_large_dog_disclosure: str | None,
    desired_start_date: _dt.date | None,
    desired_end_date: _dt.date | None,
    host_name: str,
    host_phone: str | None,
) -> tuple[str, str]:
    """Render a template against the inquiry / listing / host context.

    Returns ``(rendered_subject, rendered_body)``. If the listing has pets on
    premises and a large_dog_disclosure is set, the disclosure is prepended to
    the rendered body as its own paragraph (RENTALS_PLAN.md §9.3 — host should
    never have to remember to mention the dog).
    """
    substitutions = _build_substitutions(
        inquirer_name=inquirer_name,
        inquirer_employer=inquirer_employer,
        listing_title=listing_title,
        desired_start_date=desired_start_date,
        desired_end_date=desired_end_date,
        host_name=host_name,
        host_phone=host_phone,
    )

    rendered_subject = _substitute(template_subject, substitutions)
    rendered_body = _substitute(template_body, substitutions)

    if listing_pets_on_premises and listing_large_dog_disclosure:
        disclosure = listing_large_dog_disclosure.strip()
        if disclosure:
            rendered_body = f"{disclosure}\n\n{rendered_body}"

    return rendered_subject, rendered_body


__all__ = ["render_template", "REPLY_TEMPLATE_VARIABLES"]
