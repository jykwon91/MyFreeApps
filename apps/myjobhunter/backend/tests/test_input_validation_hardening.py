"""Schema-level input validation tests — audit 2026-05-02.

Covers four categories of hardening:
1. URL fields reject ``javascript:`` and other non-http/https schemes (CWE-79).
2. Unbounded Text columns now have length caps (CWE-400).
3. Write-side schemas enforce ``extra="forbid"`` (mass-assignment guard).
4. ``ApplicationEventResponse`` no longer exposes ``raw_payload`` (CWE-200).

These are pure unit tests against Pydantic schema construction — no DB or
HTTP calls needed. Each test class maps to one schema or one category.
"""
from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.application.application_create_request import ApplicationCreateRequest
from app.schemas.application.application_event_create_request import ApplicationEventCreateRequest
from app.schemas.application.application_event_response import ApplicationEventResponse
from app.schemas.application.application_update_request import ApplicationUpdateRequest
from app.schemas.company.company_create_request import CompanyCreateRequest
from app.schemas.company.company_update_request import CompanyUpdateRequest
from app.schemas.profile.screening_answer_create_request import ScreeningAnswerCreateRequest
from app.schemas.profile.screening_answer_update_request import ScreeningAnswerUpdateRequest
from app.schemas.profile.work_history_create_request import WorkHistoryCreateRequest
from app.schemas.profile.work_history_update_request import WorkHistoryUpdateRequest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_COMPANY_ID = str(uuid.uuid4())
_APP_BASE = {
    "company_id": _COMPANY_ID,
    "role_title": "Engineer",
    "remote_type": "remote",
    "posted_salary_currency": "USD",
}


# ===========================================================================
# Category 1 — URL fields reject non-http/https schemes (CWE-79)
# ===========================================================================


class TestApplicationUrlValidation:
    """ApplicationCreateRequest / ApplicationUpdateRequest — url field."""

    def test_create_accepts_https_url(self) -> None:
        req = ApplicationCreateRequest(**_APP_BASE, url="https://jobs.example.com/apply/123")
        assert req.url is not None

    def test_create_accepts_http_url(self) -> None:
        req = ApplicationCreateRequest(**_APP_BASE, url="http://jobs.example.com/apply/123")
        assert req.url is not None

    def test_create_accepts_none_url(self) -> None:
        req = ApplicationCreateRequest(**_APP_BASE, url=None)
        assert req.url is None

    def test_create_rejects_javascript_scheme(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationCreateRequest(**_APP_BASE, url="javascript:alert(1)")

    def test_create_rejects_data_scheme(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationCreateRequest(**_APP_BASE, url="data:text/html,<script>alert(1)</script>")

    def test_create_rejects_bare_string(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationCreateRequest(**_APP_BASE, url="not-a-url")

    def test_update_accepts_https_url(self) -> None:
        req = ApplicationUpdateRequest(url="https://example.com/job")
        assert req.url is not None

    def test_update_rejects_javascript_scheme(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationUpdateRequest(url="javascript:void(0)")

    def test_url_serializes_to_str(self) -> None:
        """AnyHttpUrl must round-trip as a plain str so DB column stays String."""
        req = ApplicationCreateRequest(**_APP_BASE, url="https://example.com/job")
        dumped = req.model_dump()
        assert isinstance(dumped["url"], str)

    def test_update_url_serializes_to_str(self) -> None:
        req = ApplicationUpdateRequest(url="https://example.com/job")
        dumped = req.to_update_dict()
        assert isinstance(dumped["url"], str)


class TestCompanyLogoUrlValidation:
    """CompanyCreateRequest / CompanyUpdateRequest — logo_url field."""

    def test_create_accepts_https_logo_url(self) -> None:
        req = CompanyCreateRequest(name="Acme", logo_url="https://cdn.example.com/logo.png")
        assert req.logo_url is not None

    def test_create_accepts_http_logo_url(self) -> None:
        req = CompanyCreateRequest(name="Acme", logo_url="http://cdn.example.com/logo.png")
        assert req.logo_url is not None

    def test_create_accepts_none_logo_url(self) -> None:
        req = CompanyCreateRequest(name="Acme", logo_url=None)
        assert req.logo_url is None

    def test_create_rejects_javascript_scheme(self) -> None:
        with pytest.raises(ValidationError):
            CompanyCreateRequest(name="Acme", logo_url="javascript:alert('xss')")

    def test_create_rejects_bare_string(self) -> None:
        with pytest.raises(ValidationError):
            CompanyCreateRequest(name="Acme", logo_url="not-a-url")

    def test_update_rejects_javascript_scheme(self) -> None:
        with pytest.raises(ValidationError):
            CompanyUpdateRequest(logo_url="javascript:void(0)")

    def test_logo_url_serializes_to_str(self) -> None:
        req = CompanyCreateRequest(name="Acme", logo_url="https://cdn.example.com/logo.png")
        dumped = req.model_dump()
        assert isinstance(dumped["logo_url"], str)

    def test_update_logo_url_serializes_to_str(self) -> None:
        req = CompanyUpdateRequest(logo_url="https://cdn.example.com/logo.png")
        dumped = req.to_update_dict()
        assert isinstance(dumped["logo_url"], str)


# ===========================================================================
# Category 2 — Length caps (CWE-400)
# ===========================================================================


class TestApplicationLengthCaps:
    """ApplicationCreateRequest / ApplicationUpdateRequest — text length caps."""

    def test_create_accepts_notes_at_limit(self) -> None:
        req = ApplicationCreateRequest(**_APP_BASE, notes="x" * 5000)
        assert req.notes is not None

    def test_create_rejects_notes_over_limit(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationCreateRequest(**_APP_BASE, notes="x" * 5001)

    def test_update_rejects_notes_over_limit(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationUpdateRequest(notes="y" * 5001)

    def test_create_accepts_jd_text_at_limit(self) -> None:
        req = ApplicationCreateRequest(**_APP_BASE, jd_text="x" * 50000)
        assert req.jd_text is not None

    def test_create_rejects_jd_text_over_limit(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationCreateRequest(**_APP_BASE, jd_text="x" * 50001)

    def test_update_rejects_jd_text_over_limit(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationUpdateRequest(jd_text="x" * 50001)


class TestScreeningAnswerLengthCaps:
    """ScreeningAnswerCreateRequest / ScreeningAnswerUpdateRequest."""

    def test_create_accepts_answer_at_limit(self) -> None:
        req = ScreeningAnswerCreateRequest(question_key="work_auth", answer="a" * 5000)
        assert req.answer is not None

    def test_create_rejects_answer_over_limit(self) -> None:
        with pytest.raises(ValidationError):
            ScreeningAnswerCreateRequest(question_key="work_auth", answer="a" * 5001)

    def test_update_accepts_answer_at_limit(self) -> None:
        req = ScreeningAnswerUpdateRequest(answer="a" * 5000)
        assert req.answer is not None

    def test_update_rejects_answer_over_limit(self) -> None:
        with pytest.raises(ValidationError):
            ScreeningAnswerUpdateRequest(answer="a" * 5001)


class TestApplicationEventNoteLengthCap:
    """ApplicationEventCreateRequest — note field."""

    def test_accepts_note_at_limit(self) -> None:
        req = ApplicationEventCreateRequest(
            event_type="applied",
            occurred_at="2025-01-01T00:00:00Z",
            note="n" * 5000,
        )
        assert req.note is not None

    def test_rejects_note_over_limit(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationEventCreateRequest(
                event_type="applied",
                occurred_at="2025-01-01T00:00:00Z",
                note="n" * 5001,
            )


class TestWorkHistoryBulletCaps:
    """WorkHistoryCreateRequest / WorkHistoryUpdateRequest — per-item bullet cap."""

    _BASE_WORK = {
        "company_name": "Acme",
        "title": "Engineer",
        "start_date": "2020-01-01",
    }

    def test_create_accepts_bullet_at_limit(self) -> None:
        req = WorkHistoryCreateRequest(**self._BASE_WORK, bullets=["x" * 2000])
        assert len(req.bullets) == 1

    def test_create_rejects_bullet_over_limit(self) -> None:
        with pytest.raises(ValidationError):
            WorkHistoryCreateRequest(**self._BASE_WORK, bullets=["x" * 2001])

    def test_create_rejects_too_many_bullets(self) -> None:
        with pytest.raises(ValidationError):
            WorkHistoryCreateRequest(**self._BASE_WORK, bullets=["bullet"] * 31)

    def test_update_rejects_bullet_over_limit(self) -> None:
        with pytest.raises(ValidationError):
            WorkHistoryUpdateRequest(bullets=["x" * 2001])

    def test_update_rejects_too_many_bullets(self) -> None:
        with pytest.raises(ValidationError):
            WorkHistoryUpdateRequest(bullets=["bullet"] * 31)

    def test_create_accepts_empty_bullets(self) -> None:
        req = WorkHistoryCreateRequest(**self._BASE_WORK, bullets=[])
        assert req.bullets == []

    def test_update_accepts_valid_bullets(self) -> None:
        req = WorkHistoryUpdateRequest(bullets=["Led team of 5", "Shipped feature X"])
        assert len(req.bullets) == 2


# ===========================================================================
# Category 3 — extra="forbid" audit
# ===========================================================================


class TestExtraForbidApplicationCreate:
    """ApplicationCreateRequest rejects unknown keys."""

    def test_rejects_extra_field(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationCreateRequest(**_APP_BASE, malicious_field="injected")

    def test_rejects_user_id_injection(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationCreateRequest(**_APP_BASE, user_id=str(uuid.uuid4()))


class TestExtraForbidApplicationUpdate:
    """ApplicationUpdateRequest rejects unknown keys."""

    def test_rejects_extra_field(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationUpdateRequest(role_title="Engineer", unknown_key="bad")


class TestExtraForbidCompanyCreate:
    """CompanyCreateRequest rejects unknown keys."""

    def test_rejects_extra_field(self) -> None:
        with pytest.raises(ValidationError):
            CompanyCreateRequest(name="Acme", injected_field="bad")


class TestExtraForbidCompanyUpdate:
    """CompanyUpdateRequest rejects unknown keys."""

    def test_rejects_extra_field(self) -> None:
        with pytest.raises(ValidationError):
            CompanyUpdateRequest(name="Acme", injected_field="bad")


class TestExtraForbidScreeningAnswerCreate:
    """ScreeningAnswerCreateRequest rejects unknown keys."""

    def test_rejects_extra_field(self) -> None:
        with pytest.raises(ValidationError):
            ScreeningAnswerCreateRequest(
                question_key="work_auth", answer="citizen", extra_key="bad",
            )


class TestExtraForbidScreeningAnswerUpdate:
    """ScreeningAnswerUpdateRequest rejects unknown keys."""

    def test_rejects_extra_field(self) -> None:
        with pytest.raises(ValidationError):
            ScreeningAnswerUpdateRequest(answer="citizen", is_eeoc=True)


class TestExtraForbidApplicationEventCreate:
    """ApplicationEventCreateRequest rejects unknown keys."""

    def test_rejects_extra_field(self) -> None:
        with pytest.raises(ValidationError):
            ApplicationEventCreateRequest(
                event_type="applied",
                occurred_at="2025-01-01T00:00:00Z",
                raw_payload={"sneaky": "injection"},
            )


class TestExtraForbidWorkHistoryCreate:
    """WorkHistoryCreateRequest rejects unknown keys."""

    def test_rejects_extra_field(self) -> None:
        with pytest.raises(ValidationError):
            WorkHistoryCreateRequest(
                company_name="Acme",
                title="Eng",
                start_date="2020-01-01",
                extra_field="bad",
            )


class TestExtraForbidWorkHistoryUpdate:
    """WorkHistoryUpdateRequest rejects unknown keys."""

    def test_rejects_extra_field(self) -> None:
        with pytest.raises(ValidationError):
            WorkHistoryUpdateRequest(title="Eng", extra_field="bad")


# ===========================================================================
# Category 4 — raw_payload removed from ApplicationEventResponse (CWE-200)
# ===========================================================================


class TestApplicationEventResponseNoRawPayload:
    """ApplicationEventResponse must not expose raw_payload."""

    def test_raw_payload_not_in_schema_fields(self) -> None:
        assert "raw_payload" not in ApplicationEventResponse.model_fields

    def test_response_excludes_raw_payload_from_serialized_output(self) -> None:
        resp = ApplicationEventResponse(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            application_id=uuid.uuid4(),
            event_type="applied",
            occurred_at="2025-01-01T00:00:00Z",
            source="manual",
            created_at="2025-01-01T00:00:00Z",
        )
        dumped = resp.model_dump()
        assert "raw_payload" not in dumped

    def test_response_still_has_expected_fields(self) -> None:
        """Regression guard — confirm the remaining fields are intact."""
        fields = set(ApplicationEventResponse.model_fields.keys())
        expected = {
            "id", "user_id", "application_id",
            "event_type", "occurred_at", "source",
            "email_message_id", "note", "created_at",
        }
        assert expected.issubset(fields)
