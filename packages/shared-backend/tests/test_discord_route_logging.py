"""Discord log lines name the route template, never an interaction token or id.

An interaction token lets anyone holding it post as the app for 15 minutes, and
WARNING lines become Sentry events, INFO lines breadcrumbs. httpx's own
``HTTP Request: ...`` INFO line is cut to the host for the same reason.
"""
import logging
from collections.abc import Callable

import httpx
import pytest

from platform_shared.services.discord import DiscordApiError, DiscordFile, DiscordRestClient
from platform_shared.services.discord.route_template import route_template

_APP = "900000000000000001"
_TOKEN = "aW50ZXJhY3Rpb246OTAwMDAwMDAwMDAwMDAwMDAx"


@pytest.mark.parametrize(
    ("path", "template"),
    [
        (f"/webhooks/{_APP}/{_TOKEN}/messages/@original", "/webhooks/{id}/{token}/messages/@original"),
        (f"/webhooks/{_APP}/{_TOKEN}", "/webhooks/{id}/{token}"),
        ("/channels/123/messages/456", "/channels/{id}/messages/{id}"),
        ("/guilds/1/members/2", "/guilds/{id}/members/{id}"),
        ("/users/@me/channels", "/users/@me/channels"),
    ],
)
def test_route_template(path: str, template: str) -> None:
    assert route_template(path) == template


async def _sleep(_: float) -> None:
    return None


def _client(handler: Callable[[httpx.Request], httpx.Response]) -> DiscordRestClient:
    return DiscordRestClient("Bot-Secret", transport=httpx.MockTransport(handler), sleep=_sleep)


def _assert_no_token(caplog: pytest.LogCaptureFixture) -> None:
    assert caplog.records
    for record in caplog.records:
        assert _TOKEN not in record.getMessage()
        assert _APP not in record.getMessage()


@pytest.mark.anyio
async def test_a_refused_followup_logs_the_template(caplog: pytest.LogCaptureFixture) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"code": 10015, "message": "Unknown Webhook"})

    with caplog.at_level(logging.INFO), pytest.raises(DiscordApiError):
        async with _client(handler) as client:
            await client.create_followup_message(_APP, _TOKEN, {"content": "hi"})

    _assert_no_token(caplog)
    assert any("route=/webhooks/{id}/{token}" in r.getMessage() for r in caplog.records)
    assert any("discord.com" in r.getMessage() for r in caplog.records if r.name == "httpx")


@pytest.mark.anyio
async def test_a_rate_limited_edit_logs_the_template(caplog: pytest.LogCaptureFixture) -> None:
    responses = iter([httpx.Response(429, json={"retry_after": 0.0}), httpx.Response(200, json={"id": "m"})])

    def handler(_: httpx.Request) -> httpx.Response:
        return next(responses)

    with caplog.at_level(logging.INFO):
        async with _client(handler) as client:
            await client.edit_original_interaction_response(_APP, _TOKEN, {"content": "hi"})

    _assert_no_token(caplog)
    assert any(
        "route=/webhooks/{id}/{token}/messages/@original" in r.getMessage() for r in caplog.records
    )


@pytest.mark.anyio
async def test_a_refused_file_edit_logs_the_template(caplog: pytest.LogCaptureFixture) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"code": 50013, "message": "Missing Permissions"})

    with caplog.at_level(logging.INFO), pytest.raises(DiscordApiError):
        async with _client(handler) as client:
            await client.edit_original_interaction_response_with_files(
                _APP, _TOKEN, {"content": "hi"}, [DiscordFile("a.csv", b"x")],
            )

    _assert_no_token(caplog)
