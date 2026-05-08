"""Tests for the shared ``attach_presigned_url_with_head_check`` helper.

Covers the behavior every domain (lease attachments, lease templates,
insurance, blackout, photo, screening) inherits:

- HEAD ok → ``is_available=True`` and ``presigned_url`` set
- HEAD NoSuchKey → ``is_available=False`` and ``presigned_url=None``
- transient S3 error → exception propagates
- empty input → returns empty unchanged
- nullable storage_key (e.g. screening pre-upload) → row passes through
- mixed present + missing in one call

The original lease-specific test (``test_attachment_response_builder.py``)
also indirectly covers this through the lease builder; this file is the
direct contract for the shared helper.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.schemas.leases.signed_lease_attachment_response import (
    SignedLeaseAttachmentResponse,
)
from app.schemas.applicants.screening_result_response import (
    ScreeningResultResponse,
)
from app.services.storage.presigned_url_attacher import (
    attach_presigned_url_with_head_check,
    build_attachment_disposition,
)


def _row(**overrides) -> SignedLeaseAttachmentResponse:
    base = {
        "id": uuid.uuid4(),
        "lease_id": uuid.uuid4(),
        "filename": "lease.pdf",
        "storage_key": f"signed-leases/{uuid.uuid4()}/{uuid.uuid4()}",
        "content_type": "application/pdf",
        "size_bytes": 1024,
        "kind": "signed_lease",
        "uploaded_by_user_id": uuid.uuid4(),
        "uploaded_at": _dt.datetime.now(_dt.timezone.utc),
        "presigned_url": None,
        "is_available": True,
    }
    base.update(overrides)
    return SignedLeaseAttachmentResponse(**base)


def _screening_row(**overrides) -> ScreeningResultResponse:
    base = {
        "id": uuid.uuid4(),
        "applicant_id": uuid.uuid4(),
        "provider": "keycheck",
        "status": "pass",
        "report_storage_key": f"screening/{uuid.uuid4()}.pdf",
        "uploaded_at": _dt.datetime.now(_dt.timezone.utc),
        "uploaded_by_user_id": uuid.uuid4(),
        "created_at": _dt.datetime.now(_dt.timezone.utc),
        "requested_at": _dt.datetime.now(_dt.timezone.utc),
    }
    base.update(overrides)
    return ScreeningResultResponse(**base)


def _mock_storage(*, exists: bool = True, raise_exc: Exception | None = None) -> MagicMock:
    storage = MagicMock()
    if raise_exc is not None:
        storage.object_exists.side_effect = raise_exc
    else:
        storage.object_exists.return_value = exists
    storage.generate_presigned_url.return_value = "https://example.com/signed-url"
    return storage


class TestSharedHelper:
    def test_empty_list(self) -> None:
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
        ) as get_storage:
            assert attach_presigned_url_with_head_check(
                [], sentry_event_name="test_event",
            ) == []
            get_storage.assert_not_called()

    def test_present_object(self) -> None:
        row = _row()
        storage = _mock_storage(exists=True)
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            [out] = attach_presigned_url_with_head_check(
                [row], sentry_event_name="test_event",
            )
        assert out.is_available is True
        assert out.presigned_url == "https://example.com/signed-url"

    def test_missing_object_flips_flag(self) -> None:
        row = _row()
        storage = _mock_storage(exists=False)
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ), patch(
            "app.services.storage.presigned_url_attacher.sentry_sdk",
        ) as sentry_mock:
            [out] = attach_presigned_url_with_head_check(
                [row], sentry_event_name="test_event",
            )
        assert out.is_available is False
        assert out.presigned_url is None
        sentry_mock.capture_message.assert_called_once()

    def test_transient_error_propagates(self) -> None:
        storage = _mock_storage(raise_exc=RuntimeError("MinIO 503"))
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            with pytest.raises(RuntimeError, match="MinIO 503"):
                attach_presigned_url_with_head_check(
                    [_row()], sentry_event_name="test_event",
                )

    def test_screening_row_with_no_storage_key_passes_through(self) -> None:
        # Screening rows can exist without an uploaded report; their
        # ``report_storage_key`` is None and we should NOT HEAD-check or
        # falsely flag them missing.
        row = _screening_row(report_storage_key=None)
        storage = _mock_storage()
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            [out] = attach_presigned_url_with_head_check(
                [row],
                storage_key_attr="report_storage_key",
                sentry_event_name="test_event",
            )
        assert out.is_available is True
        assert out.presigned_url is None
        storage.object_exists.assert_not_called()

    def test_resolver_attaches_content_disposition(self) -> None:
        row = _row(filename="Lease Agreement.pdf")
        storage = _mock_storage(exists=True)
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            attach_presigned_url_with_head_check(
                [row],
                sentry_event_name="test_event",
                download_filename_resolver=lambda r: f"{r.filename}",
            )
        call = storage.generate_presigned_url.call_args
        assert call.kwargs["response_content_disposition"] == (
            'attachment; filename="Lease Agreement.pdf"; '
            "filename*=UTF-8''Lease%20Agreement.pdf"
        )

    def test_resolver_returning_none_skips_disposition(self) -> None:
        row = _row()
        storage = _mock_storage(exists=True)
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            attach_presigned_url_with_head_check(
                [row],
                sentry_event_name="test_event",
                download_filename_resolver=lambda r: None,
            )
        call = storage.generate_presigned_url.call_args
        assert call.kwargs["response_content_disposition"] is None

    def test_no_resolver_passes_no_disposition(self) -> None:
        row = _row()
        storage = _mock_storage(exists=True)
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            attach_presigned_url_with_head_check(
                [row],
                sentry_event_name="test_event",
            )
        call = storage.generate_presigned_url.call_args
        assert call.kwargs["response_content_disposition"] is None

    def test_mixed_present_and_missing(self) -> None:
        present = _row()
        missing = _row()

        def exists_side_effect(key: str) -> bool:
            return key == present.storage_key

        storage = MagicMock()
        storage.object_exists.side_effect = exists_side_effect
        storage.generate_presigned_url.return_value = "https://example.com/signed"

        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ), patch(
            "app.services.storage.presigned_url_attacher.sentry_sdk",
        ):
            results = attach_presigned_url_with_head_check(
                [present, missing], sentry_event_name="test_event",
            )

        by_id = {r.id: r for r in results}
        assert by_id[present.id].is_available is True
        assert by_id[missing.id].is_available is False


class TestBuildAttachmentDisposition:
    def test_ascii_filename(self) -> None:
        assert build_attachment_disposition("Lease.pdf") == (
            'attachment; filename="Lease.pdf"; filename*=UTF-8\'\'Lease.pdf'
        )

    def test_filename_with_spaces_percent_encoded_in_filename_star(self) -> None:
        out = build_attachment_disposition("Lease Agreement.pdf")
        assert 'filename="Lease Agreement.pdf"' in out
        assert "filename*=UTF-8''Lease%20Agreement.pdf" in out

    def test_filename_with_quotes_escaped_in_ascii_form(self) -> None:
        out = build_attachment_disposition('a"b.pdf')
        assert 'filename="a\\"b.pdf"' in out

    def test_unicode_filename_uses_filename_star(self) -> None:
        out = build_attachment_disposition("계약서.pdf")
        # Korean chars become %-escaped in the RFC 5987 form.
        assert "filename*=UTF-8''" in out
        assert "%EA%B3%84%EC%95%BD%EC%84%9C.pdf" in out
