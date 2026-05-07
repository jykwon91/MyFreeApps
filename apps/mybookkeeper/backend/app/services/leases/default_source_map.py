"""Heuristic default mapping for known placeholder keys.

When a host uploads a template, the placeholder extractor produces raw keys
(e.g. ``TENANT FULL NAME``). For a small allowlist of well-known keys we
can pre-populate ``input_type``, ``default_source``, and ``computed_expr``
so the host doesn't have to fill them in by hand. The host can always
override.

The keys are matched after normalisation (whitespace collapsed, uppercased).

``default_source`` values follow the resolver syntax defined in
``services/leases/default_source_resolver.py``:
- Single path: ``applicant.legal_name``, ``today``
- Fallback chain: ``applicant.legal_name || inquiry.inquirer_name``
  (first non-None, non-empty value wins)

``computed_expr`` values follow the DSL in ``services/leases/computed.py``:
- ``(KEY_A - KEY_B).days`` — date diff (used for NUMBER OF DAYS)
- ``(KEY_A + KEY_B)`` — string concat
- ``today`` — current date
"""
from __future__ import annotations

from typing import NamedTuple


class PlaceholderDefault(NamedTuple):
    """Default seed for a known placeholder key."""

    input_type: str
    default_source: str | None
    computed_expr: str | None = None


_TEXT_APPLICANT_INQUIRER_NAME = PlaceholderDefault(
    "text", "applicant.legal_name || inquiry.inquirer_name",
)
_DATE_CONTRACT_START = PlaceholderDefault(
    "date", "applicant.contract_start || inquiry.desired_start_date",
)
_DATE_CONTRACT_END = PlaceholderDefault(
    "date", "applicant.contract_end || inquiry.desired_end_date",
)
_TEXT_EMPLOYER = PlaceholderDefault(
    "text", "applicant.employer_or_hospital || inquiry.inquirer_employer",
)
_DATE_TODAY = PlaceholderDefault("date", "today")


# Single source of truth — every concern (input_type, default_source,
# computed_expr) lives on one row per key.
DEFAULT_SOURCE_MAP: dict[str, PlaceholderDefault] = {
    # Tenant identity — applicant-primary, inquiry fallback. ``contact_email``
    # and ``contact_phone`` were added to the applicant model so contact
    # details persist past the inquiry stage (the inquiry can be deleted).
    "TENANT FULL NAME": _TEXT_APPLICANT_INQUIRER_NAME,
    "TENANT NAME": _TEXT_APPLICANT_INQUIRER_NAME,
    "TENANT EMAIL": PlaceholderDefault(
        "email", "applicant.contact_email || inquiry.inquirer_email",
    ),
    "TENANT PHONE": PlaceholderDefault(
        "phone", "applicant.contact_phone || inquiry.inquirer_phone",
    ),
    "TENANT EMPLOYER": _TEXT_EMPLOYER,
    "EMPLOYER": _TEXT_EMPLOYER,
    # Dates — applicant-primary (contract dates), inquiry fallback (desired dates).
    "MOVE-IN DATE": _DATE_CONTRACT_START,
    "MOVE_IN_DATE": _DATE_CONTRACT_START,
    "MOVE IN DATE": _DATE_CONTRACT_START,
    "MOVE-OUT DATE": _DATE_CONTRACT_END,
    "MOVE_OUT_DATE": _DATE_CONTRACT_END,
    "MOVE OUT DATE": _DATE_CONTRACT_END,
    # ``EFFECTIVE DATE`` is the lease commencement date — auto-filled from
    # today's date at generation time because it is a document property, not
    # a field the signer fills in.
    "EFFECTIVE DATE": _DATE_TODAY,
    # ``DATE`` (bare) appears next to signature lines ("Landlord: ___  Date:
    # ___"). Marked ``input_type="signature"`` so the generate-lease form
    # hides it (filled at signing time, not at generation), matching the
    # treatment of LANDLORD SIGNATURE / TENANT SIGNATURE. The renderer
    # substitutes unfilled ``[DATE]`` with a blank underscore line at render
    # time via ``_augment_with_signature_lines`` in renderer.py.
    "DATE": PlaceholderDefault("signature", None),
    # Computed — auto-evaluated at generate time via the computed.py DSL.
    "NUMBER OF DAYS": PlaceholderDefault(
        "computed", None, computed_expr="(MOVE-OUT DATE - MOVE-IN DATE).days",
    ),
    # Signature stubs — filled at signing time, not at generation. The
    # renderer substitutes these with a blank signature line so the rendered
    # doc never shows literal ``[LANDLORD SIGNATURE]`` text.
    "LANDLORD SIGNATURE": PlaceholderDefault("signature", None),
    "TENANT SIGNATURE": PlaceholderDefault("signature", None),
}

_FALLBACK = PlaceholderDefault("text", None)


def get_default(key: str) -> PlaceholderDefault:
    """Return the default seed for ``key`` (or text/None for unknown keys)."""
    return DEFAULT_SOURCE_MAP.get(key, _FALLBACK)


def guess_input_type_and_default(key: str) -> tuple[str, str | None]:
    """Return ``(input_type, default_source)`` for ``key``.

    Back-compat shim — new code should call :func:`get_default` directly to
    also receive ``computed_expr``.
    """
    d = get_default(key)
    return d.input_type, d.default_source


def guess_display_label(key: str) -> str:
    """Convert ``TENANT FULL NAME`` → ``Tenant full name`` for the UI label."""
    return key.replace("_", " ").replace("-", " ").lower().capitalize()
