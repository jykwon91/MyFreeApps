"""Tests for MinIO storage client and fallback behavior."""
import uuid
from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.core.storage import (
    StorageClient,
    _DualEndpointStorageClient,
    _is_configured,
    _parse_endpoint,
    get_storage,
    reset_client_cache,
)


class TestGenerateKey:
    def test_key_contains_org_id_and_filename(self) -> None:
        org_id = str(uuid.uuid4())
        key = StorageClient.generate_key(org_id, "invoice.pdf")
        parts = key.split("/")
        assert parts[0] == org_id
        assert parts[2] == "invoice.pdf"

    def test_key_contains_unique_uuid(self) -> None:
        org_id = str(uuid.uuid4())
        key1 = StorageClient.generate_key(org_id, "file.pdf")
        key2 = StorageClient.generate_key(org_id, "file.pdf")
        assert key1 != key2

    def test_key_has_three_segments(self) -> None:
        key = StorageClient.generate_key("org-123", "doc.png")
        assert len(key.split("/")) == 3


class TestParseEndpoint:
    def test_strips_https_scheme_and_marks_secure(self) -> None:
        host, secure = _parse_endpoint("https://storage.example.com")
        assert host == "storage.example.com"
        assert secure is True

    def test_strips_http_scheme_and_marks_insecure(self) -> None:
        host, secure = _parse_endpoint("http://minio:9000")
        assert host == "minio:9000"
        assert secure is False

    def test_passes_through_bare_host(self) -> None:
        host, secure = _parse_endpoint("minio:9000")
        assert host == "minio:9000"
        assert secure is False


class TestFallbackWhenNotConfigured:
    @patch("app.core.storage.settings")
    def test_get_storage_returns_none_when_not_configured(self, mock_settings: MagicMock) -> None:
        reset_client_cache()
        mock_settings.minio_endpoint = ""
        mock_settings.minio_access_key = ""
        mock_settings.minio_secret_key = ""
        assert get_storage() is None

    @patch("app.core.storage.settings")
    def test_is_configured_false_when_endpoint_empty(self, mock_settings: MagicMock) -> None:
        mock_settings.minio_endpoint = ""
        mock_settings.minio_access_key = "key"
        mock_settings.minio_secret_key = "secret"
        assert _is_configured() is False

    @patch("app.core.storage.settings")
    def test_is_configured_false_when_access_key_empty(self, mock_settings: MagicMock) -> None:
        mock_settings.minio_endpoint = "localhost:9000"
        mock_settings.minio_access_key = ""
        mock_settings.minio_secret_key = "secret"
        assert _is_configured() is False

    @patch("app.core.storage.settings")
    def test_is_configured_false_when_secret_key_empty(self, mock_settings: MagicMock) -> None:
        mock_settings.minio_endpoint = "localhost:9000"
        mock_settings.minio_access_key = "key"
        mock_settings.minio_secret_key = ""
        assert _is_configured() is False


class TestStorageClientMethods:
    def _make_client(self) -> tuple[StorageClient, MagicMock]:
        mock_minio = MagicMock()
        client = StorageClient(mock_minio, "test-bucket")
        return client, mock_minio

    def test_upload_file_calls_put_object(self) -> None:
        client, mock_minio = self._make_client()
        key = client.upload_file("org/uuid/file.pdf", b"data", "application/pdf")
        assert key == "org/uuid/file.pdf"
        mock_minio.put_object.assert_called_once()
        call_args = mock_minio.put_object.call_args
        assert call_args[0][0] == "test-bucket"
        assert call_args[0][1] == "org/uuid/file.pdf"

    def test_download_file_returns_bytes(self) -> None:
        client, mock_minio = self._make_client()
        mock_response = MagicMock()
        mock_response.read.return_value = b"file-content"
        mock_minio.get_object.return_value = mock_response
        result = client.download_file("org/uuid/file.pdf")
        assert result == b"file-content"
        mock_minio.get_object.assert_called_once_with("test-bucket", "org/uuid/file.pdf")
        mock_response.close.assert_called_once()
        mock_response.release_conn.assert_called_once()

    def test_delete_file_calls_remove_object(self) -> None:
        client, mock_minio = self._make_client()
        client.delete_file("org/uuid/file.pdf")
        mock_minio.remove_object.assert_called_once_with("test-bucket", "org/uuid/file.pdf")

    def test_delete_file_does_not_raise_on_s3_error(self) -> None:
        from minio.error import S3Error
        client, mock_minio = self._make_client()
        mock_minio.remove_object.side_effect = S3Error(
            "NoSuchKey", "The specified key does not exist.", "", "", "", ""
        )
        client.delete_file("org/uuid/nonexistent.pdf")

    def test_generate_presigned_url_delegates_to_minio_with_timedelta(self) -> None:
        client, mock_minio = self._make_client()
        mock_minio.presigned_get_object.return_value = "https://signed-url"
        url = client.generate_presigned_url("org/uuid/photo.jpg", 3600)
        assert url == "https://signed-url"
        call = mock_minio.presigned_get_object.call_args
        assert call[0][0] == "test-bucket"
        assert call[0][1] == "org/uuid/photo.jpg"
        assert call.kwargs["expires"] == timedelta(seconds=3600)

    def test_head_object_returns_metadata_when_present(self) -> None:
        client, mock_minio = self._make_client()
        stat = MagicMock()
        stat.size = 1234
        stat.etag = "abc"
        stat.content_type = "image/jpeg"
        stat.last_modified = "2026-01-01"
        mock_minio.stat_object.return_value = stat
        result = client.head_object("k")
        assert result == {
            "size": 1234,
            "etag": "abc",
            "content_type": "image/jpeg",
            "last_modified": "2026-01-01",
        }

    def test_head_object_returns_none_when_missing(self) -> None:
        from minio.error import S3Error
        client, mock_minio = self._make_client()
        mock_minio.stat_object.side_effect = S3Error(
            "NoSuchKey", "missing", "", "", "", "",
        )
        assert client.head_object("k") is None

    def test_ensure_bucket_creates_when_missing(self) -> None:
        client, mock_minio = self._make_client()
        mock_minio.bucket_exists.return_value = False
        client.ensure_bucket()
        mock_minio.make_bucket.assert_called_once_with("test-bucket")

    def test_ensure_bucket_skips_when_present(self) -> None:
        client, mock_minio = self._make_client()
        mock_minio.bucket_exists.return_value = True
        client.ensure_bucket()
        mock_minio.make_bucket.assert_not_called()


class TestDualEndpointStorageClient:
    def test_presigned_url_signed_against_public_client(self) -> None:
        internal = MagicMock()
        public = MagicMock()
        public.presigned_get_object.return_value = "https://storage.example.com/signed"
        client = _DualEndpointStorageClient(internal, public, "bucket")

        url = client.generate_presigned_url("k", 3600)

        # Public client signed it; internal client was untouched.
        assert url == "https://storage.example.com/signed"
        public.presigned_get_object.assert_called_once()
        internal.presigned_get_object.assert_not_called()

    def test_uploads_go_to_internal_client(self) -> None:
        internal = MagicMock()
        public = MagicMock()
        client = _DualEndpointStorageClient(internal, public, "bucket")

        client.upload_file("k", b"x", "image/jpeg")

        internal.put_object.assert_called_once()
        public.put_object.assert_not_called()


class TestGetStorageInitialization:
    @patch("app.core.storage.settings")
    @patch("app.core.storage.Minio")
    def test_creates_dual_endpoint_when_public_endpoint_set(
        self, mock_minio_cls: MagicMock, mock_settings: MagicMock,
    ) -> None:
        reset_client_cache()
        mock_settings.minio_endpoint = "minio:9000"
        mock_settings.minio_public_endpoint = "https://storage.example.com"
        mock_settings.minio_access_key = "k"
        mock_settings.minio_secret_key = "s"
        mock_settings.minio_bucket = "test-bucket"
        mock_settings.minio_secure = False
        instance = MagicMock()
        instance.bucket_exists.return_value = True
        mock_minio_cls.return_value = instance

        result = get_storage()
        try:
            assert isinstance(result, _DualEndpointStorageClient)
            assert mock_minio_cls.call_count == 2
        finally:
            reset_client_cache()

    @patch("app.core.storage.settings")
    @patch("app.core.storage.Minio")
    def test_creates_single_endpoint_when_no_public_endpoint(
        self, mock_minio_cls: MagicMock, mock_settings: MagicMock,
    ) -> None:
        reset_client_cache()
        mock_settings.minio_endpoint = "localhost:9000"
        mock_settings.minio_public_endpoint = ""
        mock_settings.minio_access_key = "minioadmin"
        mock_settings.minio_secret_key = "minioadmin"
        mock_settings.minio_bucket = "mybookkeeper"
        mock_settings.minio_secure = False
        instance = MagicMock()
        instance.bucket_exists.return_value = False
        mock_minio_cls.return_value = instance

        result = get_storage()
        try:
            assert result is not None
            assert not isinstance(result, _DualEndpointStorageClient)
            instance.make_bucket.assert_called_once_with("mybookkeeper")
        finally:
            reset_client_cache()

    @patch("app.core.storage.settings")
    @patch("app.core.storage.Minio")
    def test_skips_bucket_creation_when_present(
        self, mock_minio_cls: MagicMock, mock_settings: MagicMock,
    ) -> None:
        reset_client_cache()
        mock_settings.minio_endpoint = "localhost:9000"
        mock_settings.minio_public_endpoint = ""
        mock_settings.minio_access_key = "minioadmin"
        mock_settings.minio_secret_key = "minioadmin"
        mock_settings.minio_bucket = "mybookkeeper"
        mock_settings.minio_secure = False
        instance = MagicMock()
        instance.bucket_exists.return_value = True
        mock_minio_cls.return_value = instance

        result = get_storage()
        try:
            assert result is not None
            instance.make_bucket.assert_not_called()
        finally:
            reset_client_cache()

    @patch("app.core.storage.settings")
    def test_returns_cached_client_on_second_call(self, mock_settings: MagicMock) -> None:
        sentinel = MagicMock(spec=StorageClient)
        import app.core.storage as mod
        mod._client = sentinel
        try:
            mock_settings.minio_endpoint = "localhost:9000"
            mock_settings.minio_access_key = "key"
            mock_settings.minio_secret_key = "secret"

            result = get_storage()
            assert result is sentinel
        finally:
            reset_client_cache()
