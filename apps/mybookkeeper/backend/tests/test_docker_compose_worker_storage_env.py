"""Regression guard: worker services must receive the same MinIO credentials
as the api.

The upload-processor reads each document's file back from MinIO during
extraction (the api stores uploads there and records a ``file_storage_key``).
Before this guard the worker services omitted the ``MINIO_*`` env passthrough
that the ``api`` service has, so every storage-backed extraction failed with
``StorageNotConfiguredError: MinIO storage is required but the following env
vars are unset: MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY`` — the file
existed in MinIO but the worker could not reach it.
"""
from pathlib import Path

import pytest
import yaml

_COMPOSE = Path(__file__).resolve().parents[2] / "docker-compose.yml"
_REQUIRED_MINIO_KEYS = {
    "MINIO_ENDPOINT",
    "MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_BUCKET",
}
# Services that run the backend image and exercise storage-backed code paths
# (document extraction / email-sourced document storage).
_STORAGE_WORKER_SERVICES = ("upload-processor", "scheduler")


def _service_env_keys(service: dict) -> set[str]:
    env = service.get("environment", {})
    if isinstance(env, list):
        return {item.split("=", 1)[0] for item in env}
    return set(env.keys())


def _load_services() -> dict:
    return yaml.safe_load(_COMPOSE.read_text())["services"]


def test_api_declares_minio_env() -> None:
    """Baseline: the api is the source of truth the workers must mirror."""
    api_keys = _service_env_keys(_load_services()["api"])
    missing = _REQUIRED_MINIO_KEYS - api_keys
    assert not missing, f"api service is missing MinIO env keys: {sorted(missing)}"


@pytest.mark.parametrize("service_name", _STORAGE_WORKER_SERVICES)
def test_worker_declares_minio_env(service_name: str) -> None:
    services = _load_services()
    assert service_name in services, f"{service_name} service missing from docker-compose.yml"
    missing = _REQUIRED_MINIO_KEYS - _service_env_keys(services[service_name])
    assert not missing, (
        f"{service_name} is missing MinIO env keys {sorted(missing)} — the worker "
        f"reads document files back from MinIO during extraction and will raise "
        f"StorageNotConfiguredError without them. Mirror the api service's MINIO_* env."
    )
