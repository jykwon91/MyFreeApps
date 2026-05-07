"""Resolver for ``default_source`` placeholder specs.

Supports single dotted paths (``applicant.legal_name``, ``today``) and
``||``-separated fallback chains (``applicant.legal_name || inquiry.inquirer_name``).
The chain is evaluated left-to-right; the first non-None, non-empty value wins.

Usage::

    from app.services.leases.default_source_resolver import (
        resolve_default_source,
        validate_default_source_spec,
    )

    # Validate at write time — raises ValueError on bad specs.
    validate_default_source_spec("applicant.legal_name || inquiry.inquirer_name")

    # Resolve at read/generate time — returns plaintext or None.
    value = resolve_default_source(
        spec="applicant.legal_name || inquiry.inquirer_name",
        applicant=applicant_orm_row,
        inquiry=inquiry_orm_row,  # or None
    )
"""
from __future__ import annotations

import datetime
import re
from typing import Any

from app.models.applicants.applicant import Applicant
from app.models.inquiries.inquiry import Inquiry

# ---------------------------------------------------------------------------
# Allowed namespace prefixes and their attribute allowlists
# ---------------------------------------------------------------------------

_APPLICANT_ATTRS: frozenset[str] = frozenset({
    "legal_name",
    "employer_or_hospital",
    "contact_email",
    "contact_phone",
    "contract_start",
    "contract_end",
    "dob",
    "vehicle_make_model",
    "stage",
    "referred_by",
    "pets",
})

_INQUIRY_ATTRS: frozenset[str] = frozenset({
    "inquirer_name",
    "inquirer_email",
    "inquirer_phone",
    "inquirer_employer",
    "desired_start_date",
    "desired_end_date",
})

_SPECIAL_SOURCES: frozenset[str] = frozenset({"today"})

# A valid single segment: "today", "applicant.<attr>", or "inquiry.<attr>".
_SEGMENT_RE = re.compile(
    r"^(?:today|applicant\.\w+|inquiry\.\w+)$"
)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_default_source_spec(spec: str) -> None:
    """Raise ``ValueError`` if ``spec`` is not a valid default_source value.

    Valid forms:
    - A single segment: ``today``, ``applicant.legal_name``, ``inquiry.inquirer_email``
    - A ``||``-separated chain of exactly 2 segments (no N>2 chains per spec)

    Raises ``ValueError`` with a human-readable message on invalid input.
    """
    if not spec or not spec.strip():
        raise ValueError("default_source must not be blank")

    segments = [s.strip() for s in spec.split("||")]
    if len(segments) > 2:
        raise ValueError(
            "default_source supports at most one '||' fallback "
            f"(got {len(segments)} segments). Example: 'applicant.legal_name || inquiry.inquirer_name'"
        )

    for segment in segments:
        _validate_segment(segment, spec)


def _validate_segment(segment: str, full_spec: str) -> None:
    if not _SEGMENT_RE.match(segment):
        raise ValueError(
            f"Invalid default_source segment '{segment}' in '{full_spec}'. "
            "Expected 'today', 'applicant.<field>', or 'inquiry.<field>'."
        )

    if segment == "today":
        return

    namespace, attr = segment.split(".", 1)
    if namespace == "applicant" and attr not in _APPLICANT_ATTRS:
        raise ValueError(
            f"Unknown applicant field '{attr}' in '{full_spec}'. "
            f"Allowed: {sorted(_APPLICANT_ATTRS)}"
        )
    if namespace == "inquiry" and attr not in _INQUIRY_ATTRS:
        raise ValueError(
            f"Unknown inquiry field '{attr}' in '{full_spec}'. "
            f"Allowed: {sorted(_INQUIRY_ATTRS)}"
        )


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------

ProvenanceLabel = str  # "applicant" | "inquiry" | "today"


def resolve_default_source(
    spec: str,
    applicant: Applicant,
    inquiry: Inquiry | None,
) -> tuple[Any | None, ProvenanceLabel | None]:
    """Evaluate a ``default_source`` spec against live ORM rows.

    Returns ``(value, provenance)`` where:
    - ``value`` is the resolved plaintext (or ``None`` if nothing resolved).
    - ``provenance`` is ``"applicant"``, ``"inquiry"``, or ``"today"`` indicating
      which segment produced the value, or ``None`` if nothing resolved.

    PII is decrypted automatically by the ``EncryptedString`` TypeDecorator —
    callers receive plaintext.

    Dates are returned as ISO-8601 strings (``YYYY-MM-DD``) for consistency
    with the frontend ``<input type="date">`` format.
    """
    segments = [s.strip() for s in spec.split("||")]

    for segment in segments:
        value = _evaluate_segment(segment, applicant, inquiry)
        if value is not None and value != "":
            provenance = _segment_provenance(segment)
            if isinstance(value, datetime.date):
                return value.isoformat(), provenance
            return str(value), provenance

    return None, None


def _evaluate_segment(
    segment: str,
    applicant: Applicant,
    inquiry: Inquiry | None,
) -> Any | None:
    if segment == "today":
        return datetime.date.today()

    namespace, attr = segment.split(".", 1)
    if namespace == "applicant":
        return getattr(applicant, attr, None)
    if namespace == "inquiry":
        if inquiry is None:
            return None
        return getattr(inquiry, attr, None)
    return None


def _segment_provenance(segment: str) -> ProvenanceLabel:
    if segment == "today":
        return "today"
    return segment.split(".", 1)[0]
