"""Shared helpers for the WoW feature-request tests (not a test module).

Rows are created straight through the ORM on the SAVEPOINT-bound ``db``;
Claude is a fake async client returning a canned ``record_feature_request``
call (or raising), patched over ``feature_refiner._build_client``.
"""
from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import anthropic
import httpx2
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.wow_features import submit_daily_limiter, submit_hourly_limiter, vote_limiter
from app.models.wow.feature_story import WowFeatureStory
from app.models.wow.feature_submission import WowFeatureSubmission
from app.services.wow.feature_requests.feature_text import text_fingerprint

BUILD_CLIENT = "app.services.wow.feature_requests.feature_refiner._build_client"
VERIFY_TURNSTILE = "app.core.rate_limit.verify_turnstile_token"
URL = "/api/wow/feature-requests"
TRIAGE_URL = "/api/wow/feature-requests/triage"
MODEL = "claude-haiku-test"

ALL_LIMITERS = (
    submit_hourly_limiter,
    submit_daily_limiter,
    vote_limiter,
)

# Keys that must never appear anywhere in a public response.
PRIVATE_KEYS = frozenset(
    {"raw_text", "priority", "ip_hash", "voter_key", "submissions", "untrusted_submission_text", "hidden_at"}
)


def reset_limiters() -> None:
    for limiter in ALL_LIMITERS:
        limiter._buckets.clear()


def all_keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        keys = set(value)
        for item in value.values():
            keys |= all_keys(item)
        return keys
    if isinstance(value, list):
        keys: set[str] = set()
        for item in value:
            keys |= all_keys(item)
        return keys
    return set()


def story_tool_input(**story: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "title": "Alchemy leveling route",
        "persona": "a player who levels Alchemy",
        "i_want": "to follow an Alchemy route",
        "so_that": "I know what to craft",
        "acceptance_criteria": ["Given the Alchemy page, when I open it, then I see the route"],
        "follow_ups": [],
        "area": "professions",
        "topic": "alchemy",
        "feasibility": "feasible",
        "feasibility_note": None,
    }
    base.update(story)
    return {"verdict": "new", "story": base}


def fake_client(
    *,
    tool_input: dict[str, Any] | None = None,
    error: Exception | None = None,
    side_effect: Callable[..., Any] | None = None,
) -> Any:
    create = AsyncMock()
    if side_effect is not None:
        create.side_effect = side_effect
    elif error is not None:
        create.side_effect = error
    else:
        create.return_value = tool_response(tool_input or story_tool_input())
    return SimpleNamespace(messages=SimpleNamespace(create=create))


def tool_response(tool_input: dict[str, Any]) -> Any:
    block = SimpleNamespace(type="tool_use", name="record_feature_request", input=tool_input)
    return SimpleNamespace(content=[block], stop_reason="tool_use", model=MODEL)


def status_error(cls: type[anthropic.APIStatusError], status: int, error_type: str) -> Exception:
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx2.Response(status, request=request)
    body = {"type": "error", "error": {"type": error_type, "message": "boom"}}
    return cls("boom", response=response, body=body)


async def make_story(db: AsyncSession, **values: Any) -> WowFeatureStory:
    row: dict[str, Any] = {
        "title": "Alchemy leveling route",
        "persona": "a player",
        "i_want": "to follow an Alchemy route",
        "so_that": "I know what to craft",
        "acceptance_criteria": ["Given the page, when I open it, then I see it"],
        "follow_ups": [],
        "area": "professions",
        "feasibility": "feasible",
        "status": "open",
    }
    row.update(values)
    story = WowFeatureStory(**row)
    db.add(story)
    await db.flush()
    return story


async def make_submission(db: AsyncSession, **values: Any) -> WowFeatureSubmission:
    text = values.pop("raw_text", "Please add an alchemy route")
    row: dict[str, Any] = {
        "raw_text": text,
        "text_fingerprint": text_fingerprint(text),
        "verdict": "rejected",
        "professions": [],
        "activities": [],
    }
    row.update(values)
    submission = WowFeatureSubmission(**row)
    db.add(submission)
    await db.flush()
    return submission


def submit_body(text: str = "Can you add an alchemy leveling route like the tailoring one?", **extra: Any) -> dict[str, Any]:
    return {"text": text, "client_id": str(uuid.uuid4()), **extra}


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()
