"""The E2E seed-applicant request rejects fields it would otherwise drop.

Specs seed applicants through ``POST /test/seed-applicant``. A field the
request doesn't know used to be ignored, so a spec could believe it had
seeded a contact email that never reached the row.
"""
from __future__ import annotations

import datetime as _dt

import pytest
from pydantic import ValidationError

from app.test_helpers.seed import _SeedApplicantRequest


def test_accepts_contact_email_and_contract_start() -> None:
    request = _SeedApplicantRequest(
        contact_email="tenant@example.com",
        contract_start="2026-08-01",
    )
    assert request.contact_email == "tenant@example.com"
    assert request.contract_start == _dt.date(2026, 8, 1)


@pytest.mark.parametrize("field", ["contract_end", "email", "not_a_field"])
def test_rejects_unknown_fields(field: str) -> None:
    with pytest.raises(ValidationError) as exc:
        _SeedApplicantRequest(**{field: "x"})
    assert [(e["type"], e["loc"]) for e in exc.value.errors()] == [
        ("extra_forbidden", (field,)),
    ]
