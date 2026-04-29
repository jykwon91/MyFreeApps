"""HTTP route + service tests for the screening sub-domain (PR 3.3).

Covers:
- ``app/api/screening.py`` — auth gating, status-code mapping, response shape.
- ``app/services/screening/screening_service.py`` — provider registry,
  upload-pipeline orchestration, error mapping.
- ``app/services/screening/keycheck_provider.py`` — env-var override.
- ``app/services/screening/report_processor.py`` — content-type sniff,
  ClamAV mock, file-size cap.

Tenant isolation is verified by the parent tests in test_applicants_api.py;
this file focuses on the new endpoints + service surface.
"""
from __future__ import annotations

import datetime as _dt
import os
import uuid
from io import BytesIO
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.schemas.applicants.screening_result_response import ScreeningResultResponse
from app.services.screening import (
    ScreeningServiceError,
    ScreeningUploadValidationError,
    UnknownProviderError,
    get_provider,
)
from app.services.screening import keycheck_provider as _keycheck_module
from app.services.screening.keycheck_provider import (
    DEFAULT_KEYCHECK_DASHBOARD_URL,
    KeyCheckProvider,
)
from app.services.screening.report_processor import (
    ReportRejected,
    process_report,
    sniff_content_type,
)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _ctx(org_id: uuid.UUID, user_id: uuid.UUID, role: OrgRole = OrgRole.OWNER) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=role)


def _viewer_ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return _ctx(org_id, user_id, role=OrgRole.VIEWER)


def _build_response(
    *,
    applicant_id: uuid.UUID,
    user_id: uuid.UUID,
    status: str = "pass",
) -> ScreeningResultResponse:
    now = _dt.datetime.now(_dt.timezone.utc)
    return ScreeningResultResponse(
        id=uuid.uuid4(),
        applicant_id=applicant_id,
        provider="keycheck",
        status=status,
        report_storage_key="screening/abc/def.pdf",
        adverse_action_snippet=None,
        notes=None,
        requested_at=now,
        completed_at=now,
        uploaded_at=now,
        uploaded_by_user_id=user_id,
        created_at=now,
        presigned_url="https://storage.example.com/signed",
    )


PDF_HEADER = b"%PDF-1.4\n%test\n"
JPEG_HEADER = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01"


# --------------------------------------------------------------------------- #
# KeyCheck provider tests
# --------------------------------------------------------------------------- #

class TestKeyCheckProvider:
    def test_default_dashboard_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("KEYCHECK_DASHBOARD_URL", raising=False)
        provider = KeyCheckProvider()
        assert provider.dashboard_url() == DEFAULT_KEYCHECK_DASHBOARD_URL

    def test_env_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("KEYCHECK_DASHBOARD_URL", "https://staging.keycheck.example/host")
        provider = KeyCheckProvider()
        assert provider.dashboard_url() == "https://staging.keycheck.example/host"

    def test_blank_env_falls_back_to_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("KEYCHECK_DASHBOARD_URL", "   ")
        provider = KeyCheckProvider()
        assert provider.dashboard_url() == DEFAULT_KEYCHECK_DASHBOARD_URL

    def test_provider_name(self) -> None:
        assert KeyCheckProvider.name == "keycheck"


# --------------------------------------------------------------------------- #
# Provider registry tests
# --------------------------------------------------------------------------- #

class TestProviderRegistry:
    def test_get_keycheck(self) -> None:
        provider = get_provider("keycheck")
        assert provider.name == "keycheck"

    def test_get_unknown_raises(self) -> None:
        with pytest.raises(UnknownProviderError) as exc:
            get_provider("transunion")
        assert "transunion" in str(exc.value)


# --------------------------------------------------------------------------- #
# Content-type sniff tests
# --------------------------------------------------------------------------- #

class TestSniffContentType:
    def test_sniffs_pdf_header(self) -> None:
        # Header sniff path always returns application/pdf for %PDF prefix
        # regardless of whether libmagic is installed.
        assert sniff_content_type(b"%PDF-1.4\n" + b"x" * 100) == "application/pdf"

    def test_sniffs_jpeg_header(self) -> None:
        # libmagic may report image/jpeg via header; even without libmagic
        # the header-bytes fallback also returns image/jpeg.
        result = sniff_content_type(JPEG_HEADER + b"x" * 100)
        assert result == "image/jpeg"

    def test_returns_none_for_unknown(self) -> None:
        # 8+ bytes of garbage that doesn't match any allowlisted header.
        assert sniff_content_type(b"\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a") is None

    def test_returns_none_for_empty(self) -> None:
        assert sniff_content_type(b"") is None


# --------------------------------------------------------------------------- #
# process_report tests (the §8.5 pipeline)
# --------------------------------------------------------------------------- #

class TestProcessReport:
    def test_rejects_empty(self) -> None:
        with pytest.raises(ReportRejected) as exc:
            process_report(b"")
        assert "empty" in exc.value.reason

    def test_rejects_oversized(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MAX_SCREENING_REPORT_BYTES", "1024")
        big = b"%PDF-1.4\n" + b"x" * 2048
        with pytest.raises(ReportRejected) as exc:
            process_report(big)
        assert "exceeds" in exc.value.reason

    def test_rejects_unknown_format(self) -> None:
        # Random bytes that don't match any allowlisted header.
        with pytest.raises(ReportRejected) as exc:
            process_report(b"\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b" * 10)
        assert "unsupported" in exc.value.reason

    def test_accepts_pdf(self) -> None:
        pdf = PDF_HEADER + b"x" * 200
        result = process_report(pdf)
        assert result.content_type == "application/pdf"
        # PDFs are persisted as-is.
        assert result.content == pdf

    def test_clamav_finds_virus(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Wire ClamAV by setting socket path, then mock the clamd module.
        monkeypatch.setenv("CLAMAV_SOCKET_PATH", "/tmp/fake-clamd.sock")

        class _StubClamd:
            def __init__(self, path: str) -> None:
                pass

            def instream(self, _stream):
                return {"stream": ("FOUND", "EICAR-Test-Signature")}

        import sys
        import types
        fake_clamd = types.ModuleType("clamd")
        fake_clamd.ClamdUnixSocket = _StubClamd  # type: ignore[attr-defined]
        monkeypatch.setitem(sys.modules, "clamd", fake_clamd)

        with pytest.raises(ReportRejected) as exc:
            process_report(PDF_HEADER + b"x" * 200)
        assert "virus" in exc.value.reason.lower()

    def test_clamav_skipped_when_socket_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("CLAMAV_SOCKET_PATH", raising=False)
        # Should pass through cleanly with no clamd import attempted.
        result = process_report(PDF_HEADER + b"x" * 200)
        assert result.content_type == "application/pdf"


# --------------------------------------------------------------------------- #
# Route: GET /applicants/{id}/screening/redirect
# --------------------------------------------------------------------------- #

class TestRedirectEndpoint:
    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.get(f"/applicants/{uuid.uuid4()}/screening/redirect")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_happy_path_returns_url(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.screening.screening_service.initiate_redirect",
                new=AsyncMock(return_value=("https://kc.example/host", "keycheck")),
            ) as mock_init:
                client = TestClient(app)
                response = client.get(f"/applicants/{applicant_id}/screening/redirect")
                assert response.status_code == 200
                body = response.json()
                assert body["redirect_url"] == "https://kc.example/host"
                assert body["provider"] == "keycheck"
                mock_init.assert_called_once()
                kwargs = mock_init.call_args.kwargs
                assert kwargs["organization_id"] == org_id
                assert kwargs["user_id"] == user_id
                assert kwargs["applicant_id"] == applicant_id
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_missing_applicant_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.screening.screening_service.initiate_redirect",
                new=AsyncMock(side_effect=LookupError("not found")),
            ):
                client = TestClient(app)
                response = client.get(f"/applicants/{uuid.uuid4()}/screening/redirect")
                assert response.status_code == 404
                assert response.json()["detail"] == "Applicant not found"
        finally:
            app.dependency_overrides.clear()


# --------------------------------------------------------------------------- #
# Route: POST /applicants/{id}/screening/upload-result
# --------------------------------------------------------------------------- #

class TestUploadEndpoint:
    def test_unauthenticated_returns_401(self) -> None:
        client = TestClient(app)
        response = client.post(
            f"/applicants/{uuid.uuid4()}/screening/upload-result",
            files={"file": ("r.pdf", PDF_HEADER + b"x" * 100, "application/pdf")},
            data={"status": "pass"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_viewer_gets_403(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        # require_write_access raises 403 when role is VIEWER. Override
        # current_org_member only — require_write_access depends on it.
        app.dependency_overrides[current_org_member] = lambda: _viewer_ctx(org_id, user_id)
        try:
            client = TestClient(app)
            response = client.post(
                f"/applicants/{uuid.uuid4()}/screening/upload-result",
                files={"file": ("r.pdf", PDF_HEADER + b"x" * 100, "application/pdf")},
                data={"status": "pass"},
            )
            assert response.status_code == 403
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_happy_path_pass(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        response_obj = _build_response(applicant_id=applicant_id, user_id=user_id)

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.screening.screening_service.record_result",
                new=AsyncMock(return_value=response_obj),
            ) as mock_record:
                client = TestClient(app)
                response = client.post(
                    f"/applicants/{applicant_id}/screening/upload-result",
                    files={"file": ("r.pdf", PDF_HEADER + b"x" * 100, "application/pdf")},
                    data={"status": "pass"},
                )
                assert response.status_code == 201
                body = response.json()
                assert body["provider"] == "keycheck"
                assert body["status"] == "pass"
                assert body["presigned_url"] == "https://storage.example.com/signed"
                kwargs = mock_record.call_args.kwargs
                assert kwargs["applicant_id"] == applicant_id
                assert kwargs["organization_id"] == org_id
                assert kwargs["user_id"] == user_id
                assert kwargs["status"] == "pass"
                assert kwargs["adverse_action_snippet"] is None
                assert kwargs["declared_content_type"] == "application/pdf"
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_happy_path_fail_with_snippet(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()
        response_obj = _build_response(
            applicant_id=applicant_id, user_id=user_id, status="fail",
        )

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.screening.screening_service.record_result",
                new=AsyncMock(return_value=response_obj),
            ) as mock_record:
                client = TestClient(app)
                response = client.post(
                    f"/applicants/{applicant_id}/screening/upload-result",
                    files={"file": ("r.pdf", PDF_HEADER + b"x" * 100, "application/pdf")},
                    data={
                        "status": "fail",
                        "adverse_action_snippet": "Credit score below threshold",
                    },
                )
                assert response.status_code == 201
                kwargs = mock_record.call_args.kwargs
                assert kwargs["adverse_action_snippet"] == "Credit score below threshold"
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_missing_applicant_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.screening.screening_service.record_result",
                new=AsyncMock(side_effect=LookupError("not found")),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/applicants/{uuid.uuid4()}/screening/upload-result",
                    files={"file": ("r.pdf", PDF_HEADER + b"x" * 100, "application/pdf")},
                    data={"status": "pass"},
                )
                assert response.status_code == 404
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_validation_error_returns_422(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.screening.screening_service.record_result",
                new=AsyncMock(
                    side_effect=ScreeningUploadValidationError(
                        "adverse_action_snippet is required when status is 'fail'",
                    ),
                ),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/applicants/{uuid.uuid4()}/screening/upload-result",
                    files={"file": ("r.pdf", PDF_HEADER + b"x" * 100, "application/pdf")},
                    data={"status": "fail"},
                )
                assert response.status_code == 422
                assert "adverse_action_snippet" in response.json()["detail"]
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_report_rejected_maps_to_415(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.screening.screening_service.record_result",
                new=AsyncMock(side_effect=ReportRejected("unsupported file type")),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/applicants/{uuid.uuid4()}/screening/upload-result",
                    files={"file": ("r.pdf", b"not-a-pdf", "application/pdf")},
                    data={"status": "pass"},
                )
                assert response.status_code == 415
                assert "unsupported" in response.json()["detail"]
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_oversized_maps_to_413(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.screening.screening_service.record_result",
                new=AsyncMock(side_effect=ReportRejected("file exceeds 10MB limit")),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/applicants/{uuid.uuid4()}/screening/upload-result",
                    files={"file": ("r.pdf", PDF_HEADER + b"x", "application/pdf")},
                    data={"status": "pass"},
                )
                assert response.status_code == 413
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_storage_unconfigured_maps_to_503(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        app.dependency_overrides[require_write_access] = lambda: _ctx(org_id, user_id)
        try:
            from app.services.screening.screening_service import StorageNotConfiguredError
            with patch(
                "app.api.screening.screening_service.record_result",
                new=AsyncMock(side_effect=StorageNotConfiguredError("Object storage is not configured")),
            ):
                client = TestClient(app)
                response = client.post(
                    f"/applicants/{uuid.uuid4()}/screening/upload-result",
                    files={"file": ("r.pdf", PDF_HEADER + b"x", "application/pdf")},
                    data={"status": "pass"},
                )
                assert response.status_code == 503
        finally:
            app.dependency_overrides.clear()


# --------------------------------------------------------------------------- #
# Route: GET /applicants/{id}/screening
# --------------------------------------------------------------------------- #

class TestListEndpoint:
    @pytest.mark.asyncio
    async def test_lists_results_newest_first(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        applicant_id = uuid.uuid4()

        # Two responses with different uploaded_at; service returns them
        # already sorted (newest first) so the route should preserve order.
        now = _dt.datetime.now(_dt.timezone.utc)
        new = ScreeningResultResponse(
            id=uuid.uuid4(), applicant_id=applicant_id, provider="keycheck",
            status="pass", report_storage_key="screening/a/b.pdf",
            adverse_action_snippet=None, notes=None,
            requested_at=now, completed_at=now, uploaded_at=now,
            uploaded_by_user_id=user_id, created_at=now,
            presigned_url="https://x.example/new",
        )
        old = ScreeningResultResponse(
            id=uuid.uuid4(), applicant_id=applicant_id, provider="keycheck",
            status="fail", report_storage_key="screening/a/c.pdf",
            adverse_action_snippet="Credit score below threshold",
            notes=None,
            requested_at=now, completed_at=now,
            uploaded_at=now - _dt.timedelta(days=1),
            uploaded_by_user_id=user_id, created_at=now,
            presigned_url="https://x.example/old",
        )

        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.screening.screening_service.list_results",
                new=AsyncMock(return_value=[new, old]),
            ):
                client = TestClient(app)
                response = client.get(f"/applicants/{applicant_id}/screening")
                assert response.status_code == 200
                body = response.json()
                assert len(body) == 2
                assert body[0]["status"] == "pass"
                assert body[0]["presigned_url"] == "https://x.example/new"
                assert body[1]["status"] == "fail"
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_missing_applicant_returns_404(self) -> None:
        org_id, user_id = uuid.uuid4(), uuid.uuid4()
        app.dependency_overrides[current_org_member] = lambda: _ctx(org_id, user_id)
        try:
            with patch(
                "app.api.screening.screening_service.list_results",
                new=AsyncMock(side_effect=LookupError("not found")),
            ):
                client = TestClient(app)
                response = client.get(f"/applicants/{uuid.uuid4()}/screening")
                assert response.status_code == 404
        finally:
            app.dependency_overrides.clear()


# --------------------------------------------------------------------------- #
# Service: validate_upload_payload
# --------------------------------------------------------------------------- #

class TestUploadValidation:
    def test_rejects_unknown_status(self) -> None:
        from app.services.screening.screening_service import _validate_upload_payload
        with pytest.raises(ScreeningUploadValidationError) as exc:
            _validate_upload_payload("approved", None)
        assert "must be one of" in str(exc.value)

    def test_requires_snippet_on_fail(self) -> None:
        from app.services.screening.screening_service import _validate_upload_payload
        with pytest.raises(ScreeningUploadValidationError) as exc:
            _validate_upload_payload("fail", None)
        assert "adverse_action_snippet" in str(exc.value)

    def test_requires_snippet_on_inconclusive(self) -> None:
        from app.services.screening.screening_service import _validate_upload_payload
        with pytest.raises(ScreeningUploadValidationError) as exc:
            _validate_upload_payload("inconclusive", "")
        assert "adverse_action_snippet" in str(exc.value)

    def test_pass_does_not_need_snippet(self) -> None:
        from app.services.screening.screening_service import _validate_upload_payload
        # Should not raise.
        _validate_upload_payload("pass", None)

    def test_pending_does_not_need_snippet(self) -> None:
        from app.services.screening.screening_service import _validate_upload_payload
        _validate_upload_payload("pending", None)
