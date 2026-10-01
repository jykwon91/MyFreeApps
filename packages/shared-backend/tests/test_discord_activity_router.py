"""Tests for the shared Discord Activity config router factory."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from platform_shared.api.discord_activity_router import build_discord_activity_router


def _client(client_id: str) -> TestClient:
    app = FastAPI()
    app.include_router(build_discord_activity_router(client_id=client_id))
    return TestClient(app)


def test_returns_the_client_id() -> None:
    resp = _client("1555249458542022666").get("/discord/activity-config")

    assert resp.status_code == 200
    assert resp.json() == {"client_id": "1555249458542022666"}


def test_route_is_resource_level_without_api_prefix() -> None:
    client = _client("123")

    assert client.get("/api/discord/activity-config").status_code == 404
    assert client.get("/discord/activity-config").status_code == 200


def test_is_read_only() -> None:
    resp = _client("123").post("/discord/activity-config", json={"client_id": "evil"})

    assert resp.status_code == 405


def test_empty_client_id_is_rejected_at_build_time() -> None:
    with pytest.raises(ValueError, match="Discord application id"):
        build_discord_activity_router(client_id="")
