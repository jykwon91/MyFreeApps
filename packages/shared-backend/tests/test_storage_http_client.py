"""platform_shared.core.storage builds minio's HTTP client with bounded timeouts.

minio-py's default waits up to 5 minutes per connect and per read and retries
5 times, so a stalled MinIO could block a caller for ~30 minutes.
"""
from __future__ import annotations

import urllib3

from platform_shared.core.storage import _DualEndpointStorageClient, build_storage_client
from platform_shared.core.storage_constants import (
    STORAGE_CONNECT_TIMEOUT_SECONDS,
    STORAGE_MAX_RETRIES,
    STORAGE_READ_TIMEOUT_SECONDS,
    STORAGE_RETRY_STATUS_CODES,
)


def _pool(minio_client: object) -> urllib3.PoolManager:
    pool = getattr(minio_client, "_http")
    assert isinstance(pool, urllib3.PoolManager)
    return pool


def _assert_bounded(pool: urllib3.PoolManager) -> None:
    timeout = pool.connection_pool_kw["timeout"]
    assert timeout.connect_timeout == STORAGE_CONNECT_TIMEOUT_SECONDS
    assert timeout.read_timeout == STORAGE_READ_TIMEOUT_SECONDS
    retries = pool.connection_pool_kw["retries"]
    assert retries.total == STORAGE_MAX_RETRIES
    assert tuple(retries.status_forcelist) == STORAGE_RETRY_STATUS_CODES
    assert pool.connection_pool_kw["cert_reqs"] == "CERT_REQUIRED"


def test_single_endpoint_client_has_bounded_timeouts() -> None:
    client = build_storage_client(
        endpoint="localhost:9000", access_key="k", secret_key="s", bucket="b",
        public_endpoint="", secure=False,
    )
    _assert_bounded(_pool(client._client))


def test_both_dual_endpoint_clients_have_bounded_timeouts() -> None:
    client = build_storage_client(
        endpoint="minio:9000", access_key="k", secret_key="s", bucket="b",
        public_endpoint="https://storage.example.com", secure=False,
    )
    assert isinstance(client, _DualEndpointStorageClient)
    _assert_bounded(_pool(client._client))
    _assert_bounded(_pool(client._public_client))


def test_timeouts_bound_a_stalled_minio_to_minutes_not_half_an_hour() -> None:
    worst_case = (STORAGE_MAX_RETRIES + 1) * (
        STORAGE_CONNECT_TIMEOUT_SECONDS + STORAGE_READ_TIMEOUT_SECONDS
    )
    assert worst_case < 5 * 60
