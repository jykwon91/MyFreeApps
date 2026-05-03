"""Heuristic default-source mapping for known placeholder keys.

When a host uploads a template, the placeholder extractor produces raw keys
(e.g. ``TENANT FULL NAME``). For a small allowlist of well-known keys we
can pre-populate ``default_source`` and ``input_type`` so the host doesn't
have to fill them in by hand. The host can always override.

The keys are matched after normalisation (whitespace collapsed, uppercased).
"""
from __future__ import annotations

# (input_type, default_source) — None means "no default".
DEFAULT_SOURCE_MAP: dict[str, tuple[str, str | None]] = {
    # Tenant identity
    "TENANT FULL NAME": ("text", "applicant.legal_name"),
    "TENANT NAME": ("text", "applicant.legal_name"),
    "TENANT EMAIL": ("email", "applicant.email"),
    "TENANT PHONE": ("phone", "applicant.phone"),
    "TENANT EMPLOYER": ("text", "applicant.employer_or_hospital"),
    # Dates
    "MOVE-IN DATE": ("date", "applicant.contract_start"),
    "MOVE_IN_DATE": ("date", "applicant.contract_start"),
    "MOVE IN DATE": ("date", "applicant.contract_start"),
    "MOVE-OUT DATE": ("date", "applicant.contract_end"),
    "MOVE_OUT_DATE": ("date", "applicant.contract_end"),
    "MOVE OUT DATE": ("date", "applicant.contract_end"),
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
