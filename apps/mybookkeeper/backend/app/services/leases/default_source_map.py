"""Heuristic default-source mapping for known placeholder keys.

When a host uploads a template, the placeholder extractor produces raw keys
(e.g. ``TENANT FULL NAME``). For a small allowlist of well-known keys we
can pre-populate ``default_source`` and ``input_type`` so the host doesn't
have to fill them in by hand. The host can always override.

The keys are matched after normalisation (whitespace collapsed, uppercased).

``default_source`` values follow the resolver syntax defined in
``services/leases/default_source_resolver.py``:
- Single path: ``applicant.legal_name``, ``today``
- Fallback chain: ``applicant.legal_name || inquiry.inquirer_name``
  (first non-None, non-empty value wins)

NOTE: Applicant has no ``email`` or ``phone`` columns — those PII fields
live only on the Inquiry model (``inquirer_email``, ``inquirer_phone``).
For those fields the inquiry is the primary source with no applicant fallback.
"""
from __future__ import annotations

# (input_type, default_source) — None means "no default".
DEFAULT_SOURCE_MAP: dict[str, tuple[str, str | None]] = {
    # Tenant identity — applicant-primary where the field exists, inquiry fallback otherwise.
    "TENANT FULL NAME": ("text", "applicant.legal_name || inquiry.inquirer_name"),
    "TENANT NAME": ("text", "applicant.legal_name || inquiry.inquirer_name"),
    # Email and phone only exist on Inquiry — no applicant fallback.
    "TENANT EMAIL": ("email", "inquiry.inquirer_email"),
    "TENANT PHONE": ("phone", "inquiry.inquirer_phone"),
    "TENANT EMPLOYER": ("text", "applicant.employer_or_hospital || inquiry.inquirer_employer"),
    "EMPLOYER": ("text", "applicant.employer_or_hospital || inquiry.inquirer_employer"),
    # Dates — applicant-primary (contract dates), inquiry fallback (desired dates).
    "MOVE-IN DATE": ("date", "applicant.contract_start || inquiry.desired_start_date"),
    "MOVE_IN_DATE": ("date", "applicant.contract_start || inquiry.desired_start_date"),
    "MOVE IN DATE": ("date", "applicant.contract_start || inquiry.desired_start_date"),
    "MOVE-OUT DATE": ("date", "applicant.contract_end || inquiry.desired_end_date"),
    "MOVE_OUT_DATE": ("date", "applicant.contract_end || inquiry.desired_end_date"),
    "MOVE OUT DATE": ("date", "applicant.contract_end || inquiry.desired_end_date"),
    "EFFECTIVE DATE": ("date", "today"),
    "DATE": ("date", "today"),
    # Computed
    "NUMBER OF DAYS": ("computed", None),
    # Signature stubs — filled at signing time, not at generation.
    "LANDLORD SIGNATURE": ("signature", None),
    "TENANT SIGNATURE": ("signature", None),
}


def guess_input_type_and_default(key: str) -> tuple[str, str | None]:
    """Return ``(input_type, default_source)`` for ``key`` (or text/None default)."""
    return DEFAULT_SOURCE_MAP.get(key, ("text", None))


def guess_display_label(key: str) -> str:
    """Convert ``TENANT FULL NAME`` → ``Tenant full name`` for the UI label."""
    return key.replace("_", " ").replace("-", " ").lower().capitalize()
