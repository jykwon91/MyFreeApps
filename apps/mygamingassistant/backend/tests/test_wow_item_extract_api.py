"""POST /api/wow/items/extract — public gating, input validation, Claude error mapping.

The route is PUBLIC in both modes (no login) and gated by availability →
per-IP limit → Turnstile → input validation → durable daily cap.

Claude is never called: ``item_extractor._build_client`` is patched with a fake
async client that returns a canned ``record_item`` tool call (or raises).
Turnstile is never called: ``app.core.rate_limit.verify_turnstile_token`` is
patched.
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

import anthropic
import httpx2
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.repositories.daily_quota_repo import get_daily_usage

from app.api.wow_items import item_extract_limiter
from app.core.config import settings
from app.services.wow.item_extractor import DAILY_CAP_BUCKET

URL = "/api/wow/items/extract"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
BUILD_CLIENT = "app.services.wow.item_extractor._build_client"
VERIFY_TURNSTILE = "app.core.rate_limit.verify_turnstile_token"
TOKEN_HEADER = {"X-Turnstile-Token": "tok"}

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
def _reader_on(monkeypatch: pytest.MonkeyPatch):
    # Reader on: key set, default cap. The conftest sets the Turnstile secret
    # to "", so the Turnstile dependency is a no-op unless a test sets one.
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(settings, "wow_extract_daily_cap", 300)
    item_extract_limiter._buckets.clear()
    yield
    item_extract_limiter._buckets.clear()


# --- Public in both modes ----------------------------------------------------


async def test_full_auth_mode_needs_no_login(client: AsyncClient) -> None:
    with patch(BUILD_CLIENT, return_value=_fake_client(tool_input=TOOL_INPUT)):
        resp = await client.post(URL, data={"text": "Blackstone Ring"})
    assert resp.status_code == 200, resp.text


async def test_serve_only_happy_path_with_turnstile(
    serve_only_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Production shape: route is mounted, Turnstile verified, Claude called."""
    monkeypatch.setattr(settings, "serve_only", True)
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    verify = AsyncMock(return_value=(True, []))
    fake = _fake_client(tool_input=TOOL_INPUT)
    with patch(VERIFY_TURNSTILE, verify), patch(BUILD_CLIENT, return_value=fake):
        resp = await serve_only_client.post(
            URL, data={"text": "Blackstone Ring"}, headers=TOKEN_HEADER
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["item"]["name"] == "Blackstone Ring"
    assert verify.await_args.args[0] == "tok"
    fake.messages.create.assert_awaited_once()


# --- Availability (503 item_reader_unavailable, checked first) ---------------


async def test_missing_api_key_is_unavailable(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    resp = await client.post(URL, data={"text": "Blackstone Ring"})
    assert resp.status_code == 503
    assert resp.json()["detail"] == "item_reader_unavailable"


async def test_serve_only_without_turnstile_secret_is_unavailable(
    serve_only_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An anonymous deployment never exposes the paid call without a CAPTCHA."""
    monkeypatch.setattr(settings, "serve_only", True)
    fake = _fake_client(tool_input=TOOL_INPUT)
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await serve_only_client.post(URL, data={"text": "Blackstone Ring"})
    assert resp.status_code == 503
    assert resp.json()["detail"] == "item_reader_unavailable"
    fake.messages.create.assert_not_awaited()


async def test_production_without_turnstile_secret_is_unavailable(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "environment", "production")
    resp = await client.post(URL, data={"text": "Blackstone Ring"})
    assert resp.status_code == 503
    assert resp.json()["detail"] == "item_reader_unavailable"


async def test_zero_daily_cap_is_unavailable(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "wow_extract_daily_cap", 0)
    resp = await client.post(URL, data={"text": "Blackstone Ring"})
    assert resp.status_code == 503
    assert resp.json()["detail"] == "item_reader_unavailable"


# --- Turnstile (shared platform_shared dependency) ---------------------------


async def test_missing_turnstile_token_is_400(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    fake = _fake_client(tool_input=TOOL_INPUT)
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await client.post(URL, data={"text": "Blackstone Ring"})
    assert resp.status_code == 400
    fake.messages.create.assert_not_awaited()


async def test_expired_turnstile_token_asks_to_retry(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    verify = AsyncMock(return_value=(False, ["timeout-or-duplicate"]))
    with patch(VERIFY_TURNSTILE, verify):
        resp = await client.post(URL, data={"text": "Ring"}, headers=TOKEN_HEADER)
    assert resp.status_code == 400
    assert resp.json()["detail"] == "captcha_expired_please_retry"


async def test_turnstile_misconfig_is_503_and_logged(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    verify = AsyncMock(return_value=(False, ["invalid-input-secret"]))
    with patch(VERIFY_TURNSTILE, verify):
        resp = await client.post(URL, data={"text": "Ring"}, headers=TOKEN_HEADER)
    assert resp.status_code == 503
    assert resp.json()["detail"] == "captcha_service_misconfigured"
    assert "invalid-input-secret" in caplog.text


# --- Per-IP limit + durable daily cap ----------------------------------------


async def test_per_ip_rate_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(item_extract_limiter._config, "max_attempts", 2)
    ip_a = {"X-Forwarded-For": "203.0.113.1"}
    with patch(BUILD_CLIENT, return_value=_fake_client(tool_input=TOOL_INPUT)):
        statuses = [
            (await client.post(URL, data={"text": "Ring"}, headers=ip_a)).status_code
            for _ in range(3)
        ]
        other_ip = await client.post(
            URL, data={"text": "Ring"}, headers={"X-Forwarded-For": "203.0.113.2"}
        )
    assert statuses == [200, 200, 429]
    assert other_ip.status_code == 200


async def test_over_daily_cap_is_429_without_calling_claude(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "wow_extract_daily_cap", 2)
    fake = _fake_client(tool_input=TOOL_INPUT)
    with patch(BUILD_CLIENT, return_value=fake):
        # Distinct IPs — the cap is global, not per caller.
        responses = [
            await client.post(
                URL, data={"text": "Ring"}, headers={"X-Forwarded-For": f"198.51.100.{i}"}
            )
            for i in range(3)
        ]
    assert [r.status_code for r in responses] == [200, 200, 429]
    assert responses[2].json()["detail"] == "item_reader_daily_limit_reached"
    assert fake.messages.create.await_count == 2
    assert await get_daily_usage(db, bucket=DAILY_CAP_BUCKET) == 2


async def test_invalid_input_does_not_consume_daily_cap(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "wow_extract_daily_cap", 1)
    bad = await client.post(
        URL, files={"image": ("evil.png", b"<script>alert(1)</script>", "image/png")}
    )
    assert bad.status_code == 422
    assert await get_daily_usage(db, bucket=DAILY_CAP_BUCKET) == 0
    with patch(BUILD_CLIENT, return_value=_fake_client(tool_input=TOOL_INPUT)):
        good = await client.post(URL, data={"text": "Ring"})
    assert good.status_code == 200


# --- Extraction + input validation -------------------------------------------


async def test_text_extraction_returns_parsed_item(client: AsyncClient) -> None:
    fake = _fake_client(tool_input=TOOL_INPUT)
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await client.post(URL, data={"text": "Blackstone Ring\n+20 Stamina"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["item"]["name"] == "Blackstone Ring"
    assert body["item"]["stats"] == {"stamina": 20.0, "hit_pct": 1.0, "attack_power": 20.0}
    kwargs = fake.messages.create.call_args.kwargs
    assert kwargs["model"] == settings.claude_item_extractor_model
    assert kwargs["tool_choice"] == {"type": "tool", "name": "record_item"}


async def test_image_extraction_sniffs_media_type(client: AsyncClient) -> None:
    fake = _fake_client(tool_input=TOOL_INPUT)
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await client.post(URL, files={"image": ("tooltip.jpg", PNG_BYTES, "image/jpeg")})
    assert resp.status_code == 200, resp.text
    content = fake.messages.create.call_args.kwargs["messages"][0]["content"]
    # Declared type was jpeg; the bytes are PNG — the magic bytes win.
    assert content[0]["source"]["media_type"] == "image/png"


async def test_rejects_non_image_bytes(client: AsyncClient) -> None:
    resp = await client.post(
        URL, files={"image": ("evil.png", b"<script>alert(1)</script>", "image/png")}
    )
    assert resp.status_code == 422
    assert "PNG, JPEG or WebP" in resp.json()["detail"]


async def test_rejects_oversized_image(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "item_extract_max_image_bytes", 32)
    resp = await client.post(URL, files={"image": ("big.png", PNG_BYTES, "image/png")})
    assert resp.status_code == 413


@pytest.mark.parametrize(
    "kwargs",
    [
        {"data": {}},
        {"data": {"text": "   "}},
        {"data": {"text": "Ring"}, "files": {"image": ("t.png", PNG_BYTES, "image/png")}},
    ],
)
async def test_requires_exactly_one_input(client: AsyncClient, kwargs: dict) -> None:
    resp = await client.post(URL, **kwargs)
    assert resp.status_code == 422


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
    client: AsyncClient,
    error: Exception,
    expected_status: int,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with patch(BUILD_CLIENT, return_value=_fake_client(error=error)):
        resp = await client.post(URL, data={"text": "Blackstone Ring"})
    assert resp.status_code == expected_status
    # The documented Anthropic error.type is logged, not swallowed.
    assert error.type in caplog.text  # type: ignore[attr-defined]


async def test_not_a_tooltip_is_422(client: AsyncClient) -> None:
    fake = _fake_client(tool_input={"is_item_tooltip": False, "stats": {}, "unparsed_effects": []})
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await client.post(URL, data={"text": "hello there"})
    assert resp.status_code == 422
    assert "doesn't look like" in resp.json()["detail"]
