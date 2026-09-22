"""POST /api/wow/items/extract — auth gating, input validation, Claude error mapping.

Claude is never called: ``item_extractor._build_client`` is patched with a fake
async client that returns a canned ``record_item`` tool call (or raises).
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

import anthropic
import httpx2
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.wow_items import item_extract_limiter
from app.core.config import settings
from app.models.user.user import User

URL = "/api/wow/items/extract"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

TOOL_INPUT: dict[str, Any] = {
    "is_item_tooltip": True,
    "name": "Blackstone Ring",
    "quality": "rare",
    "slot": "finger",
    "item_type": None,
    "armor": None,
    "weapon": None,
    "stats": {"stamina": 20, "hit_pct": 1, "attack_power": 20},
    "unparsed_effects": [],
    "required_level": 58,
    "set_name": None,
}


def _fake_client(*, tool_input: dict | None = None, error: Exception | None = None) -> Any:
    create = AsyncMock()
    if error is not None:
        create.side_effect = error
    else:
        block = SimpleNamespace(type="tool_use", name="record_item", input=tool_input)
        create.return_value = SimpleNamespace(content=[block], stop_reason="tool_use")
    return SimpleNamespace(messages=SimpleNamespace(create=create))


def _status_error(cls: type[anthropic.APIStatusError], status: int, error_type: str) -> Exception:
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx2.Response(status, request=request)
    body = {"type": "error", "error": {"type": error_type, "message": "boom"}}
    return cls("boom", response=response, body=body)


@pytest.fixture(autouse=True)
def _api_key_and_limiter(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    item_extract_limiter._buckets.clear()
    yield
    item_extract_limiter._buckets.clear()


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    from fastapi_users.password import PasswordHelper
    from sqlalchemy import select

    email, password = "wow-extract-test@example.com", "testpassword123!"
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        db.add(
            User(
                email=email,
                hashed_password=PasswordHelper().hash(password),
                is_verified=True,
                is_active=True,
            )
        )
        await db.flush()
    resp = await client.post(
        "/api/auth/jwt/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, resp.text
    client.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"
    return client


async def test_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(URL, data={"text": "Blackstone Ring"})
    assert resp.status_code == 401


async def test_text_extraction_returns_parsed_item(auth_client: AsyncClient) -> None:
    fake = _fake_client(tool_input=TOOL_INPUT)
    with patch("app.services.wow.item_extractor._build_client", return_value=fake):
        resp = await auth_client.post(URL, data={"text": "Blackstone Ring\n+20 Stamina"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["item"]["name"] == "Blackstone Ring"
    assert body["item"]["stats"] == {"stamina": 20.0, "hit_pct": 1.0, "attack_power": 20.0}
    kwargs = fake.messages.create.call_args.kwargs
    assert kwargs["model"] == settings.claude_item_extractor_model
    assert kwargs["tool_choice"] == {"type": "tool", "name": "record_item"}


async def test_image_extraction_sniffs_media_type(auth_client: AsyncClient) -> None:
    fake = _fake_client(tool_input=TOOL_INPUT)
    with patch("app.services.wow.item_extractor._build_client", return_value=fake):
        resp = await auth_client.post(
            URL, files={"image": ("tooltip.jpg", PNG_BYTES, "image/jpeg")}
        )
    assert resp.status_code == 200, resp.text
    content = fake.messages.create.call_args.kwargs["messages"][0]["content"]
    # Declared type was jpeg; the bytes are PNG — the magic bytes win.
    assert content[0]["source"]["media_type"] == "image/png"


async def test_rejects_non_image_bytes(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        URL, files={"image": ("evil.png", b"<script>alert(1)</script>", "image/png")}
    )
    assert resp.status_code == 422
    assert "PNG, JPEG or WebP" in resp.json()["detail"]


async def test_rejects_oversized_image(
    auth_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "item_extract_max_image_bytes", 32)
    resp = await auth_client.post(URL, files={"image": ("big.png", PNG_BYTES, "image/png")})
    assert resp.status_code == 413


@pytest.mark.parametrize(
    "kwargs",
    [
        {"data": {}},
        {"data": {"text": "   "}},
        {"data": {"text": "Ring"}, "files": {"image": ("t.png", PNG_BYTES, "image/png")}},
    ],
)
async def test_requires_exactly_one_input(auth_client: AsyncClient, kwargs: dict) -> None:
    resp = await auth_client.post(URL, **kwargs)
    assert resp.status_code == 422


async def test_missing_api_key_is_503(
    auth_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    resp = await auth_client.post(URL, data={"text": "Blackstone Ring"})
    assert resp.status_code == 503
    assert "isn't set up" in resp.json()["detail"]


@pytest.mark.parametrize(
    ("error", "expected_status"),
    [
        (_status_error(anthropic.RateLimitError, 429, "rate_limit_error"), 429),
        (_status_error(anthropic.AuthenticationError, 401, "authentication_error"), 503),
        (_status_error(anthropic.BadRequestError, 400, "invalid_request_error"), 422),
        (_status_error(anthropic.InternalServerError, 529, "overloaded_error"), 503),
    ],
)
async def test_anthropic_errors_map_to_specific_statuses(
    auth_client: AsyncClient,
    error: Exception,
    expected_status: int,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with patch(
        "app.services.wow.item_extractor._build_client",
        return_value=_fake_client(error=error),
    ):
        resp = await auth_client.post(URL, data={"text": "Blackstone Ring"})
    assert resp.status_code == expected_status
    # The documented Anthropic error.type is logged, not swallowed.
    assert error.type in caplog.text  # type: ignore[attr-defined]


async def test_not_a_tooltip_is_422(auth_client: AsyncClient) -> None:
    fake = _fake_client(tool_input={"is_item_tooltip": False, "stats": {}, "unparsed_effects": []})
    with patch("app.services.wow.item_extractor._build_client", return_value=fake):
        resp = await auth_client.post(URL, data={"text": "hello there"})
    assert resp.status_code == 422
    assert "doesn't look like" in resp.json()["detail"]


async def test_per_user_rate_limit(
    auth_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(item_extract_limiter._config, "max_attempts", 2)
    fake = _fake_client(tool_input=TOOL_INPUT)
    with patch("app.services.wow.item_extractor._build_client", return_value=fake):
        statuses = [
            (await auth_client.post(URL, data={"text": "Ring"})).status_code for _ in range(3)
        ]
    assert statuses == [200, 200, 429]
