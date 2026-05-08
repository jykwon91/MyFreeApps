"""Tests for ``attach_presigned_urls_to_attachments``.

Covers the orphan-detection path added with the lease-attachment-missing UX:
- HEAD ok → ``is_available=True`` and ``presigned_url`` set
- HEAD NoSuchKey → ``is_available=False`` and ``presigned_url=None``
- transient S3 error → exception propagates (no silent degradation)
- empty input list → returns empty list without touching storage
"""
from __future__ import annotations

import datetime as _dt
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.schemas.leases.signed_lease_attachment_response import (
    SignedLeaseAttachmentResponse,
)
from app.services.leases.attachment_response_builder import (
    attach_presigned_urls_to_attachments,
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
        "signed_by_tenant_at": None,
        "signed_by_landlord_at": None,
        "presigned_url": None,
        "is_available": True,
    }
    base.update(overrides)
    return SignedLeaseAttachmentResponse(**base)


def _mock_storage(*, exists: bool = True, raise_exc: Exception | None = None) -> MagicMock:
    storage = MagicMock()
    if raise_exc is not None:
        storage.object_exists.side_effect = raise_exc
    else:
        storage.object_exists.return_value = exists
    storage.generate_presigned_url.return_value = "https://example.com/signed-url"
    return storage


class TestAttachPresignedUrlsToAttachments:
    def test_empty_list_returns_empty(self) -> None:
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
        ) as get_storage:
            result = attach_presigned_urls_to_attachments([])
            assert result == []
            get_storage.assert_not_called()

    def test_present_object_gets_presigned_url(self) -> None:
        row = _row()
        storage = _mock_storage(exists=True)
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            [out] = attach_presigned_urls_to_attachments([row])
        assert out.is_available is True
        assert out.presigned_url == "https://example.com/signed-url"
        storage.object_exists.assert_called_once_with(row.storage_key)
        storage.generate_presigned_url.assert_called_once()

    def test_unsigned_lease_uses_original_filename_in_disposition(self) -> None:
        row = _row(filename="Lease Agreement.pdf", kind="signed_lease")
        storage = _mock_storage(exists=True)
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            attach_presigned_urls_to_attachments([row])
        disposition = storage.generate_presigned_url.call_args.kwargs[
            "response_content_disposition"
        ]
        assert 'filename="Lease Agreement.pdf"' in disposition
        assert "tenant signed" not in disposition
        assert "fully signed" not in disposition

    def test_tenant_signed_lease_appends_tenant_signed_suffix(self) -> None:
        row = _row(
            filename="Lease Agreement.pdf",
            kind="signed_lease",
            signed_by_tenant_at=_dt.datetime.now(_dt.timezone.utc),
        )
        storage = _mock_storage(exists=True)
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            attach_presigned_urls_to_attachments([row])
        disposition = storage.generate_presigned_url.call_args.kwargs[
            "response_content_disposition"
        ]
        assert 'filename="Lease Agreement - tenant signed.pdf"' in disposition

    def test_fully_signed_lease_appends_fully_signed_suffix(self) -> None:
        now = _dt.datetime.now(_dt.timezone.utc)
        row = _row(
            filename="Lease Agreement.pdf",
            kind="signed_lease",
            signed_by_tenant_at=now,
            signed_by_landlord_at=now,
        )
        storage = _mock_storage(exists=True)
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            attach_presigned_urls_to_attachments([row])
        disposition = storage.generate_presigned_url.call_args.kwargs[
            "response_content_disposition"
        ]
        assert 'filename="Lease Agreement - fully signed.pdf"' in disposition

    def test_inspection_kind_keeps_original_filename(self) -> None:
        # Even if the signing-state columns are populated by accident,
        # non-lease kinds must not get the suffix.
        now = _dt.datetime.now(_dt.timezone.utc)
        row = _row(
            filename="Move-In Inspection.pdf",
            kind="move_in_inspection",
            signed_by_tenant_at=now,
            signed_by_landlord_at=now,
        )
        storage = _mock_storage(exists=True)
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            attach_presigned_urls_to_attachments([row])
        disposition = storage.generate_presigned_url.call_args.kwargs[
            "response_content_disposition"
        ]
        assert 'filename="Move-In Inspection.pdf"' in disposition
        assert "signed" not in disposition

    def test_missing_object_flips_is_available_and_skips_url(self) -> None:
        row = _row(presigned_url=None, is_available=True)
        storage = _mock_storage(exists=False)
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ), patch(
            "app.services.storage.presigned_url_attacher.sentry_sdk",
        ) as sentry_mock:
            [out] = attach_presigned_urls_to_attachments([row])
        assert out.is_available is False
        assert out.presigned_url is None
        storage.generate_presigned_url.assert_not_called()
        sentry_mock.capture_message.assert_called_once()
        # Confirm we set the lease_id + row id tags so Sentry groups
        # missing-file events by lease (operator can see at-a-glance whether
        # this is one orphan or many). The shared helper auto-tags ``id``
        # (the attachment's primary key) and ``lease_id`` from common
        # attribute names; per-domain Sentry events differ only by the
        # event name string.
        scope_cm = sentry_mock.new_scope.return_value
        scope = scope_cm.__enter__.return_value
        tag_calls = {call.args[0]: call.args[1] for call in scope.set_tag.call_args_list}
        assert tag_calls["lease_id"] == str(row.lease_id)
        assert tag_calls["id"] == str(row.id)

    def test_transient_error_propagates(self) -> None:
        row = _row()
        storage = _mock_storage(raise_exc=RuntimeError("MinIO 503"))
        with patch(
            "app.services.storage.presigned_url_attacher.get_storage",
            return_value=storage,
        ):
            with pytest.raises(RuntimeError, match="MinIO 503"):
                attach_presigned_urls_to_attachments([row])

    def test_mixed_present_and_missing_in_one_call(self) -> None:
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
        ), patch("app.services.storage.presigned_url_attacher.sentry_sdk"):
            results = attach_presigned_urls_to_attachments([present, missing])

        by_id = {r.id: r for r in results}
        assert by_id[present.id].is_available is True
        assert by_id[present.id].presigned_url == "https://example.com/signed"
        assert by_id[missing.id].is_available is False
        assert by_id[missing.id].presigned_url is None
