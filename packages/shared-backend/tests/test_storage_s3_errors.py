"""Storage errors keep MinIO's S3 code, and a failed delete is never silent.

Runs the real minio-py client (with the retry settings ``build_storage_client``
uses) against a local server that fails the way MinIO does.
"""
from __future__ import annotations

import time

import pytest
from minio.error import InvalidResponseError, S3Error, ServerError

from platform_shared.core.storage import StorageClient, build_storage_client
from platform_shared.core.storage_constants import (
    STORAGE_MAX_RETRIES,
    STORAGE_RETRY_BACKOFF_FACTOR,
)
from tests.fake_s3_reply import FakeS3Reply
from tests.fake_s3_server import fake_s3_server, s3_error_xml


def _client(endpoint: str) -> StorageClient:
    return build_storage_client(endpoint=endpoint, access_key="k", secret_key="s", bucket="bucket")


def test_a_5xx_that_outlasts_the_retries_raises_s3_error_with_its_code() -> None:
    reply = FakeS3Reply(503, s3_error_xml("SlowDown", "Please reduce your request rate."))
    with fake_s3_server(reply) as endpoint, pytest.raises(S3Error) as exc_info:
        _client(endpoint).download_file("k")
    assert exc_info.value.code == "SlowDown"
    assert reply.requests == ["GET"] * (STORAGE_MAX_RETRIES + 1)


def test_minio_retry_after_is_ignored_so_a_slow_down_ends_within_the_backoff_budget() -> None:
    # MinIO asks for 120 s between retries on SlowDown; obeying it would hold a
    # storage thread for about six minutes.
    reply = FakeS3Reply(503, s3_error_xml("SlowDown"), headers={"Retry-After": "120"})
    # urllib3 waits 0 after the first failure, then factor * 2^(n-1) after the nth.
    backoff_budget = sum(
        STORAGE_RETRY_BACKOFF_FACTOR * 2 ** (attempt - 1)
        for attempt in range(2, STORAGE_MAX_RETRIES + 1)
    )
    started = time.monotonic()
    with fake_s3_server(reply) as endpoint, pytest.raises(S3Error):
        _client(endpoint).download_file("k")
    assert time.monotonic() - started < backoff_budget + 5
    assert reply.requests == ["GET"] * (STORAGE_MAX_RETRIES + 1)


def test_a_non_xml_5xx_raises_minio_invalid_response_not_a_urllib3_error() -> None:
    reply = FakeS3Reply(502, b"<html>Bad Gateway</html>", content_type="text/html")
    with fake_s3_server(reply) as endpoint, pytest.raises(InvalidResponseError):
        _client(endpoint).download_file("k")


def test_a_5xx_existence_check_raises_rather_than_reading_as_missing() -> None:
    # A HEAD reply has no body, so minio-py can only report the status.
    reply = FakeS3Reply(503)
    with fake_s3_server(reply) as endpoint, pytest.raises(ServerError) as exc_info:
        _client(endpoint).object_exists("k")
    assert exc_info.value.status_code == 503


def test_delete_file_raises_when_minio_refuses_so_the_object_is_known_to_remain() -> None:
    reply = FakeS3Reply(403, s3_error_xml("AccessDenied", "Access Denied."))
    with fake_s3_server(reply) as endpoint, pytest.raises(S3Error) as exc_info:
        _client(endpoint).delete_file("k")
    assert exc_info.value.code == "AccessDenied"


def test_delete_file_raises_s3_error_when_minio_keeps_failing() -> None:
    reply = FakeS3Reply(503, s3_error_xml("SlowDown"))
    with fake_s3_server(reply) as endpoint, pytest.raises(S3Error) as exc_info:
        _client(endpoint).delete_file("k")
    assert exc_info.value.code == "SlowDown"


def test_deleting_a_missing_key_succeeds() -> None:
    # What real S3 and MinIO answer to a DELETE of a key that isn't there.
    reply = FakeS3Reply(204)
    with fake_s3_server(reply) as endpoint:
        _client(endpoint).delete_file("k")
    assert reply.requests == ["DELETE"]


def test_delete_file_treats_a_no_such_key_reply_as_removed() -> None:
    # Real S3 and MinIO answer 204 (above); an S3-compatible store that
    # answers NoSuchKey still counts the object as gone.
    reply = FakeS3Reply(404, s3_error_xml("NoSuchKey", "The specified key does not exist."))
    with fake_s3_server(reply) as endpoint:
        _client(endpoint).delete_file("k")
    assert reply.requests == ["DELETE"]
