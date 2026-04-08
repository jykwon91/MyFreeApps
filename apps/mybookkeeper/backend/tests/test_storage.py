"""Tests for MinIO storage client and fallback behavior."""
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.core.storage import StorageClient, get_storage, _is_configured


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


class TestFallbackWhenNotConfigured:
    @patch("app.core.storage.settings")
    def test_get_storage_returns_none_when_not_configured(self, mock_settings: MagicMock) -> None:
        import app.core.storage as mod
        mod._client = None
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


class TestGetStorageInitialization:
    @patch("app.core.storage.settings")
    @patch("app.core.storage.Minio")
    def test_get_storage_creates_bucket_if_missing(
        self, mock_minio_cls: MagicMock, mock_settings: MagicMock
    ) -> None:
        import app.core.storage as mod
        mod._client = None
        mock_settings.minio_endpoint = "localhost:9000"
        mock_settings.minio_access_key = "minioadmin"
        mock_settings.minio_secret_key = "minioadmin"
        mock_settings.minio_bucket = "mybookkeeper"
        mock_settings.minio_secure = False
        mock_instance = MagicMock()
        mock_instance.bucket_exists.return_value = False
        mock_minio_cls.return_value = mock_instance

        result = get_storage()

        assert result is not None
        mock_instance.make_bucket.assert_called_once_with("mybookkeeper")
        mod._client = None

    @patch("app.core.storage.settings")
    @patch("app.core.storage.Minio")
    def test_get_storage_skips_bucket_creation_if_exists(
        self, mock_minio_cls: MagicMock, mock_settings: MagicMock
    ) -> None:
        import app.core.storage as mod
        mod._client = None
        mock_settings.minio_endpoint = "localhost:9000"
        mock_settings.minio_access_key = "minioadmin"
        mock_settings.minio_secret_key = "minioadmin"
        mock_settings.minio_bucket = "mybookkeeper"
        mock_settings.minio_secure = False
        mock_instance = MagicMock()
        mock_instance.bucket_exists.return_value = True
        mock_minio_cls.return_value = mock_instance

        result = get_storage()

        assert result is not None
        mock_instance.make_bucket.assert_not_called()
        mod._client = None

    @patch("app.core.storage.settings")
    def test_get_storage_returns_cached_client(self, mock_settings: MagicMock) -> None:
        import app.core.storage as mod
        sentinel = MagicMock(spec=StorageClient)
        mod._client = sentinel
        mock_settings.minio_endpoint = "localhost:9000"
        mock_settings.minio_access_key = "key"
        mock_settings.minio_secret_key = "secret"

        result = get_storage()
        assert result is sentinel
        mod._client = None
