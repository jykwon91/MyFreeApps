"""Public WoW feature requests: gating order, submit verdicts, board, votes.

Claude is never called (``feature_refiner._build_client`` is a fake);
Turnstile is never called (``verify_turnstile_token`` is patched when a test
switches the secret on). Rows land on the SAVEPOINT-bound test session.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock, patch

import anthropic
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.rate_limit import _BucketConfig
from platform_shared.repositories.daily_quota_repo import get_daily_usage, try_consume_daily_quota

from app.api import wow_features
from app.core.config import settings
from app.main import create_app
from app.core.wow_feature_request_limits import DAILY_CAP_BUCKET
from app.models.wow.feature_story import WowFeatureStory
from app.models.wow.feature_submission import WowFeatureSubmission
from app.models.wow.feature_vote import WowFeatureVote
from app.services.wow.feature_requests import feature_submission_service

from wow_feature_fixtures import ALCHEMY_POTIONS_DUPLICATE
from wow_feature_helpers import (
    BUILD_CLIENT,
    PRIVATE_KEYS,
    URL,
    VERIFY_TURNSTILE,
    all_keys,
    fake_client,
    make_story,
    make_submission,
    reset_limiters,
    status_error,
    story_tool_input,
    submit_body,
    tool_response,
)


@pytest.fixture(autouse=True)
def _feature_requests_on(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(settings, "wow_feature_request_daily_cap", 100)
    reset_limiters()
    yield
    reset_limiters()


def _vote_body(client_id: uuid.UUID | None = None) -> dict[str, str]:
    return {"client_id": str(client_id or uuid.uuid4())}


async def _count(db: AsyncSession, model: type) -> int:
    return int(await db.scalar(select(func.count()).select_from(model)) or 0)


# --- Gating order --------------------------------------------------------------


async def test_unavailable_without_api_key(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    resp = await client.post(URL, json=submit_body())
    assert resp.status_code == 503
    assert resp.json()["detail"] == "feature_requests_unavailable"


async def test_unavailable_when_cap_is_zero(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "wow_feature_request_daily_cap", 0)
    resp = await client.post(URL, json=submit_body())
    assert resp.status_code == 503
    assert resp.json()["detail"] == "feature_requests_unavailable"


async def test_ip_limit_runs_before_turnstile(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    statuses = [(await client.post(URL, json=submit_body())).status_code for _ in range(6)]
    assert statuses[:5] == [400] * 5  # no Turnstile token
    assert statuses[5] == 429


async def test_ip_limit_sends_retry_after(client: AsyncClient) -> None:
    with patch(BUILD_CLIENT, return_value=fake_client()):
        for _ in range(5):
            await client.post(URL, json=submit_body(text=f"Please add feature number {uuid.uuid4()}"))
    resp = await client.post(URL, json=submit_body())
    assert resp.status_code == 429
    assert int(resp.headers["retry-after"]) > 0


async def test_daily_ip_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wow_features.submit_daily_limiter, "_config", _BucketConfig(2, 86400))
    with patch(BUILD_CLIENT, return_value=fake_client()):
        first = await client.post(URL, json=submit_body(text="First distinct feature request"))
        second = await client.post(URL, json=submit_body(text="Second distinct feature request"))
        third = await client.post(URL, json=submit_body(text="Third distinct feature request"))
    assert (first.status_code, second.status_code, third.status_code) == (200, 200, 429)


async def test_turnstile_runs_before_validation(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    resp = await client.post(URL, json=submit_body(text="short"))
    assert resp.status_code == 400


async def test_turnstile_token_is_verified(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    verify = AsyncMock(return_value=(True, []))
    with patch(VERIFY_TURNSTILE, verify), patch(BUILD_CLIENT, return_value=fake_client()):
        resp = await client.post(URL, json=submit_body(), headers={"X-Turnstile-Token": "tok"})
    assert resp.status_code == 200
    verify.assert_awaited_once()


async def test_short_text_is_rejected_before_claude(client: AsyncClient) -> None:
    fake = fake_client()
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await client.post(URL, json=submit_body(text="  short\x00   "))
    assert resp.status_code == 422
    fake.messages.create.assert_not_called()


async def test_body_contract_is_strict(client: AsyncClient) -> None:
    resp = await client.post(URL, json={**submit_body(), "priority": 1})
    assert resp.status_code == 422
    resp = await client.post(URL, json={"client_id": str(uuid.uuid4())})
    assert resp.status_code == 422
    resp = await client.post(URL, json=submit_body(context={"class_id": "monk"}))
    assert resp.status_code == 422


async def test_inbox_full_runs_after_validation_and_before_claude(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(feature_submission_service, "MAX_UNTRIAGED_SUBMISSIONS", 1)
    await make_submission(db)
    fake = fake_client()
    with patch(BUILD_CLIENT, return_value=fake):
        assert (await client.post(URL, json=submit_body(text="short"))).status_code == 422
        resp = await client.post(URL, json=submit_body())
    assert resp.status_code == 503
    assert resp.json()["detail"] == "feature_inbox_full"
    fake.messages.create.assert_not_called()
    assert await get_daily_usage(db, bucket=DAILY_CAP_BUCKET) == 0


async def test_daily_cap_runs_before_claude(client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "wow_feature_request_daily_cap", 1)
    await try_consume_daily_quota(db, bucket=DAILY_CAP_BUCKET, cap=1)
    fake = fake_client()
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await client.post(URL, json=submit_body())
    assert resp.status_code == 429
    assert resp.json()["detail"] == "feature_requests_daily_limit_reached"
    assert int(resp.headers["retry-after"]) > 0
    fake.messages.create.assert_not_called()


async def test_successful_submit_consumes_one_quota_unit(client: AsyncClient, db: AsyncSession) -> None:
    with patch(BUILD_CLIENT, return_value=fake_client()):
        assert (await client.post(URL, json=submit_body())).status_code == 200
    assert await get_daily_usage(db, bucket=DAILY_CAP_BUCKET) == 1


@pytest.mark.parametrize(
    ("error", "status_code", "detail"),
    [
        (status_error(anthropic.RateLimitError, 429, "rate_limit_error"), 429, "feature_refiner_busy"),
        (status_error(anthropic.AuthenticationError, 401, "authentication_error"), 503, "feature_refiner_unavailable"),
        (status_error(anthropic.InternalServerError, 529, "overloaded_error"), 503, "feature_refiner_unavailable"),
    ],
)
async def test_claude_errors_are_mapped(
    client: AsyncClient, error: Exception, status_code: int, detail: str, caplog: pytest.LogCaptureFixture
) -> None:
    with patch(BUILD_CLIENT, return_value=fake_client(error=error)):
        resp = await client.post(URL, json=submit_body())
    assert resp.status_code == status_code
    assert resp.json()["detail"] == detail
    error_type = error.body["error"]["type"]  # type: ignore[attr-defined]
    assert error_type in caplog.text


async def test_refiner_busy_sends_retry_after(client: AsyncClient) -> None:
    error = status_error(anthropic.RateLimitError, 429, "rate_limit_error")
    with patch(BUILD_CLIENT, return_value=fake_client(error=error)):
        resp = await client.post(URL, json=submit_body())
    assert resp.headers["retry-after"] == "60"


async def test_no_tool_call_is_an_upstream_failure(client: AsyncClient, db: AsyncSession) -> None:
    fake = fake_client()
    fake.messages.create.return_value = type("R", (), {"content": [], "stop_reason": "end_turn", "model": "m"})()
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await client.post(URL, json=submit_body())
    assert resp.status_code == 503
    assert await _count(db, WowFeatureSubmission) == 0


# --- Verdicts ---------------------------------------------------------------------


async def test_new_creates_a_private_story(client: AsyncClient, db: AsyncSession) -> None:
    with patch(BUILD_CLIENT, return_value=fake_client()):
        resp = await client.post(URL, json=submit_body(context={"professions": ["alchemy"]}))
    assert resp.status_code == 200
    body = resp.json()
    assert body["verdict"] == "new"
    assert body["story"]["status"] == "submitted"
    assert body["story"]["area"] == "professions"
    assert not all_keys(body) & PRIVATE_KEYS

    story = await db.get(WowFeatureStory, uuid.UUID(body["story"]["id"]))
    assert story is not None and story.status == "submitted"
    submission = await db.get(WowFeatureSubmission, uuid.UUID(body["submission_id"]))
    assert submission is not None
    assert submission.verdict == "new" and submission.story_id == story.id
    assert submission.professions == ["alchemy"]
    assert submission.model_id == "claude-haiku-test"
    assert submission.ip_hash and len(submission.ip_hash) == 64

    # Private until triage approves it.
    assert (await client.get(f"{URL}/{story.id}")).status_code == 404
    board = (await client.get(URL)).json()
    assert board["total"] == 0


async def test_duplicate_links_and_votes_once(client: AsyncClient, db: AsyncSession) -> None:
    target = await make_story(db, title="Alchemy leveling route")
    fake = fake_client(tool_input=ALCHEMY_POTIONS_DUPLICATE.tool_input)
    body = submit_body(text=ALCHEMY_POTIONS_DUPLICATE.text)
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await client.post(URL, json=body)
    data = resp.json()
    assert data["verdict"] == "duplicate"
    assert data["story"]["id"] == str(target.id)
    assert data["story"]["vote_count"] == 1
    assert data["voted"] is True
    assert data["nuance_note"] == "Wants the potions named at each step."
    assert not all_keys(data) & PRIVATE_KEYS

    prompt = fake.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "S1 [professions] Alchemy leveling route" in prompt
    submission = await db.scalar(select(WowFeatureSubmission).where(WowFeatureSubmission.story_id == target.id))
    assert submission is not None and submission.verdict == "duplicate"
    vote = await db.scalar(select(WowFeatureVote).where(WowFeatureVote.story_id == target.id))
    assert vote is not None and vote.source == "submission"


async def test_duplicate_vote_shares_the_network_cap(client: AsyncClient, db: AsyncSession) -> None:
    target = await make_story(db)
    for _ in range(3):
        await client.post(f"{URL}/{target.id}/vote", json=_vote_body())
    with patch(BUILD_CLIENT, return_value=fake_client(tool_input=ALCHEMY_POTIONS_DUPLICATE.tool_input)):
        resp = await client.post(URL, json=submit_body(text=ALCHEMY_POTIONS_DUPLICATE.text))
    data = resp.json()
    assert data["verdict"] == "duplicate"
    assert data["voted"] is False
    assert data["story"]["vote_count"] == 3


async def test_duplicate_follows_a_merge_made_during_the_claude_call(client: AsyncClient, db: AsyncSession) -> None:
    source = await make_story(db, title="Alchemy route")
    target = await make_story(db, title="Alchemy and potions route")

    async def merge_then_answer(**_kwargs: Any) -> Any:
        source.status, source.merged_into_id = "duplicate", target.id
        await db.flush()
        return tool_response(ALCHEMY_POTIONS_DUPLICATE.tool_input)

    # The source is S1 in the prompt: it has the most votes.
    source.vote_count = 100
    await db.flush()

    with patch(BUILD_CLIENT, return_value=fake_client(side_effect=merge_then_answer)):
        resp = await client.post(URL, json=submit_body(text=ALCHEMY_POTIONS_DUPLICATE.text))
    data = resp.json()
    assert data["verdict"] == "duplicate"
    assert data["story"]["id"] == str(target.id)


async def test_duplicate_whose_target_was_hidden_becomes_new(client: AsyncClient, db: AsyncSession) -> None:
    target = await make_story(db)

    async def hide_then_answer(**_kwargs: Any) -> Any:
        target.hidden_at = target.created_at
        await db.flush()
        return tool_response(ALCHEMY_POTIONS_DUPLICATE.tool_input)

    with patch(BUILD_CLIENT, return_value=fake_client(side_effect=hide_then_answer)):
        resp = await client.post(URL, json=submit_body(text=ALCHEMY_POTIONS_DUPLICATE.text))
    data = resp.json()
    assert data["verdict"] == "new"
    assert data["story"]["status"] == "submitted"
    assert data["story"]["title"] == "Alchemy potion leveling guide"


async def test_clarification_then_one_follow_up(client: AsyncClient, db: AsyncSession) -> None:
    question = {"verdict": "needs_clarification", "question": "Which profession?", "story": None}
    with patch(BUILD_CLIENT, return_value=fake_client(tool_input=question)):
        first = await client.post(URL, json=submit_body(text="I want a leveling guide"))
    asked = first.json()
    assert asked == {"verdict": "needs_clarification", "submission_id": asked["submission_id"], "question": "Which profession?"}

    follow_up = {
        "parent_submission_id": asked["submission_id"],
        "clarification_answer": "Alchemy",
        "client_id": str(uuid.uuid4()),
    }
    # Claude tries to ask again: the follow-up must still produce a story.
    fake = fake_client(tool_input=question)
    with patch(BUILD_CLIENT, return_value=fake):
        second = await client.post(URL, json=follow_up)
    assert second.json()["verdict"] == "new"
    prompt = fake.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "I want a leveling guide" in prompt and "Alchemy" in prompt and "FOLLOW-UP" in prompt

    parent = await db.get(WowFeatureSubmission, uuid.UUID(asked["submission_id"]))
    assert parent is not None and parent.triaged_at is not None
    child = await db.scalar(
        select(WowFeatureSubmission).where(WowFeatureSubmission.parent_submission_id == parent.id)
    )
    assert child is not None
    assert child.raw_text == "I want a leveling guide" and child.clarification_answer == "Alchemy"

    with patch(BUILD_CLIENT, return_value=fake_client()):
        again = await client.post(URL, json={**follow_up, "client_id": str(uuid.uuid4())})
    assert again.status_code == 409
    assert again.json()["detail"] == "clarification_already_answered"


@pytest.mark.parametrize("answer", ["", "   	  ", None])
async def test_skipped_question_still_produces_a_story(
    client: AsyncClient, db: AsyncSession, answer: str | None
) -> None:
    question = {"verdict": "needs_clarification", "question": "Which profession?", "story": None}
    with patch(BUILD_CLIENT, return_value=fake_client(tool_input=question)):
        asked = (await client.post(URL, json=submit_body(text="I want a leveling guide"))).json()

    body: dict[str, Any] = {"parent_submission_id": asked["submission_id"], "client_id": str(uuid.uuid4())}
    if answer is not None:
        body["clarification_answer"] = answer
    # Claude tries to ask again: a skipped question must still produce a story.
    fake = fake_client(tool_input=question)
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await client.post(URL, json=body)
    assert resp.status_code == 200
    assert resp.json()["verdict"] == "new"
    prompt = fake.messages.create.call_args.kwargs["messages"][0]["content"]
    assert "chose to skip it" in prompt and "<untrusted_clarification_answer>" not in prompt

    parent = await db.get(WowFeatureSubmission, uuid.UUID(asked["submission_id"]))
    assert parent is not None and parent.triaged_at is not None
    child = await db.scalar(
        select(WowFeatureSubmission).where(WowFeatureSubmission.parent_submission_id == parent.id)
    )
    assert child is not None and child.clarification_answer is None and child.story_id is not None

    with patch(BUILD_CLIENT, return_value=fake_client()):
        again = await client.post(URL, json={**body, "client_id": str(uuid.uuid4())})
    assert again.status_code == 409


async def test_answer_without_a_parent_is_rejected(client: AsyncClient) -> None:
    resp = await client.post(URL, json=submit_body(clarification_answer="Alchemy"))
    assert resp.status_code == 422


async def test_follow_up_to_unknown_parent(client: AsyncClient) -> None:
    body = {"parent_submission_id": str(uuid.uuid4()), "clarification_answer": "x", "client_id": str(uuid.uuid4())}
    resp = await client.post(URL, json=body)
    assert resp.status_code == 404


async def test_follow_up_to_a_non_question(client: AsyncClient, db: AsyncSession) -> None:
    rejected = await make_submission(db, verdict="rejected")
    body = {"parent_submission_id": str(rejected.id), "clarification_answer": "x", "client_id": str(uuid.uuid4())}
    resp = await client.post(URL, json=body)
    assert resp.status_code == 409


async def test_rejected_says_nothing_more(client: AsyncClient, db: AsyncSession) -> None:
    reject = {"verdict": "rejected", "reject_reason": "Spam", "story": None}
    with patch(BUILD_CLIENT, return_value=fake_client(tool_input=reject)):
        resp = await client.post(URL, json=submit_body(text="buy cheap gold now at my shop"))
    assert resp.json() == {"verdict": "rejected"}
    submission = await db.scalar(select(WowFeatureSubmission))
    assert submission is not None and submission.reason == "Spam" and submission.story_id is None


async def test_same_text_reuses_the_story_without_claude(client: AsyncClient, db: AsyncSession) -> None:
    with patch(BUILD_CLIENT, return_value=fake_client()):
        first = (await client.post(URL, json=submit_body())).json()
    fake = fake_client()
    with patch(BUILD_CLIENT, return_value=fake):
        again = (await client.post(URL, json=submit_body(text="  CAN you add an alchemy leveling route like the tailoring one?"))).json()
    fake.messages.create.assert_not_called()
    assert again == first
    assert await get_daily_usage(db, bucket=DAILY_CAP_BUCKET) == 1


async def test_same_text_as_a_public_story_counts_as_me_too(client: AsyncClient, db: AsyncSession) -> None:
    with patch(BUILD_CLIENT, return_value=fake_client()):
        first = (await client.post(URL, json=submit_body())).json()
    story = await db.get(WowFeatureStory, uuid.UUID(first["story"]["id"]))
    assert story is not None
    story.status = "open"
    await db.flush()
    fake = fake_client()
    with patch(BUILD_CLIENT, return_value=fake):
        again = (await client.post(URL, json=submit_body())).json()
    fake.messages.create.assert_not_called()
    assert again["verdict"] == "duplicate"
    assert again["voted"] is True and again["story"]["vote_count"] == 1


# --- Board + detail ---------------------------------------------------------------


async def test_board_shows_only_public_stories(client: AsyncClient, db: AsyncSession) -> None:
    visible = await make_story(db, title="Visible", vote_count=2)
    await make_story(db, title="Submitted", status="submitted")
    await make_story(db, title="Hidden", hidden_at=visible.created_at)
    await make_story(db, title="Shipped", status="shipped", shipped_path="/wow-forever/map")
    merged_target = await make_story(db, title="Target")
    await make_story(db, title="Merged", status="duplicate", merged_into_id=merged_target.id)

    board = (await client.get(URL)).json()
    assert {item["title"] for item in board["items"]} == {"Visible", "Target"}
    assert board["items"][0]["title"] == "Visible"  # most votes first
    assert not all_keys(board) & PRIVATE_KEYS

    shipped = (await client.get(URL, params={"status": "shipped"})).json()
    assert [item["title"] for item in shipped["items"]] == ["Shipped"]
    # A private status can't be asked for.
    assert (await client.get(URL, params={"status": "submitted"})).status_code == 422


async def test_board_filters_sorts_and_pages(client: AsyncClient, db: AsyncSession) -> None:
    start = datetime(2026, 11, 1, tzinfo=timezone.utc)
    for index in range(3):
        await make_story(
            db, title=f"Map {index}", area="map_travel", vote_count=index, created_at=start + timedelta(hours=index)
        )
    await make_story(db, title="PvP", area="pvp", created_at=start + timedelta(days=1))
    page = (await client.get(URL, params={"area": "map_travel", "limit": 2})).json()
    assert [item["title"] for item in page["items"]] == ["Map 2", "Map 1"]
    assert page["total"] == 3 and page["next_offset"] == 2
    rest = (await client.get(URL, params={"area": "map_travel", "limit": 2, "offset": 2})).json()
    assert [item["title"] for item in rest["items"]] == ["Map 0"] and rest["next_offset"] is None
    newest = (await client.get(URL, params={"sort": "new", "limit": 1})).json()
    assert newest["items"][0]["title"] == "PvP"


async def test_board_reports_my_votes(client: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db)
    other = await make_story(db, title="Other")
    me = uuid.uuid4()
    await client.post(f"{URL}/{story.id}/vote", json=_vote_body(me))
    board = (await client.get(URL, params={"client_id": str(me)})).json()
    assert board["voted_story_ids"] == [str(story.id)]
    assert str(other.id) not in board["voted_story_ids"]


async def test_detail(client: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db, priority=1, operator_note="On the list")
    data = (await client.get(f"{URL}/{story.id}")).json()
    assert data["operator_note"] == "On the list"
    assert not all_keys(data) & PRIVATE_KEYS
    assert (await client.get(f"{URL}/{uuid.uuid4()}")).status_code == 404


async def test_detail_of_a_merged_story_points_at_the_target(client: AsyncClient, db: AsyncSession) -> None:
    target = await make_story(db)
    merged = await make_story(db, status="duplicate", merged_into_id=target.id)
    assert (await client.get(f"{URL}/{merged.id}")).json() == {"merged_into_id": str(target.id)}
    target.status = "submitted"
    await db.flush()
    assert (await client.get(f"{URL}/{merged.id}")).status_code == 404


async def test_triage_word_is_not_a_story_id(client: AsyncClient) -> None:
    assert (await client.get(f"{URL}/triage")).status_code == 404


# --- Votes ------------------------------------------------------------------------


async def test_same_voter_twice_counts_once(client: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db)
    me = uuid.uuid4()
    first = (await client.post(f"{URL}/{story.id}/vote", json=_vote_body(me))).json()
    second = (await client.post(f"{URL}/{story.id}/vote", json=_vote_body(me))).json()
    assert first == second == {"story_id": str(story.id), "voted": True, "vote_count": 1}
    assert await _count(db, WowFeatureVote) == 1


async def test_vote_toggle(client: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db)
    me = uuid.uuid4()
    await client.post(f"{URL}/{story.id}/vote", json=_vote_body(me))
    off = (await client.request("DELETE", f"{URL}/{story.id}/vote", json=_vote_body(me))).json()
    assert off == {"story_id": str(story.id), "voted": False, "vote_count": 0}
    again = (await client.request("DELETE", f"{URL}/{story.id}/vote", json=_vote_body(me))).json()
    assert again["vote_count"] == 0
    on = (await client.post(f"{URL}/{story.id}/vote", json=_vote_body(me))).json()
    assert on["vote_count"] == 1


async def test_three_votes_per_network_per_story(client: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db)
    other_story = await make_story(db, title="Other")
    for _ in range(3):
        assert (await client.post(f"{URL}/{story.id}/vote", json=_vote_body())).status_code == 200
    fourth = await client.post(f"{URL}/{story.id}/vote", json=_vote_body())
    assert fourth.status_code == 429
    assert fourth.json()["detail"] == "vote_limit_reached"
    # Another network, or another story, is unaffected.
    elsewhere = await client.post(
        f"{URL}/{story.id}/vote", json=_vote_body(), headers={"X-Forwarded-For": "203.0.113.9"}
    )
    assert elsewhere.status_code == 200
    assert (await client.post(f"{URL}/{other_story.id}/vote", json=_vote_body())).status_code == 200


async def test_ipv6_votes_share_a_slash_64(client: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db)
    for suffix in ("1", "2", "3"):
        headers = {"X-Forwarded-For": f"2001:db8:1:2::{suffix}"}
        assert (await client.post(f"{URL}/{story.id}/vote", json=_vote_body(), headers=headers)).status_code == 200
    headers = {"X-Forwarded-For": "2001:db8:1:2:ffff::9"}
    assert (await client.post(f"{URL}/{story.id}/vote", json=_vote_body(), headers=headers)).status_code == 429


async def test_vote_on_a_merged_story_lands_on_the_target(client: AsyncClient, db: AsyncSession) -> None:
    target = await make_story(db)
    merged = await make_story(db, status="duplicate", merged_into_id=target.id)
    data = (await client.post(f"{URL}/{merged.id}/vote", json=_vote_body())).json()
    assert data == {"story_id": str(target.id), "voted": True, "vote_count": 1}


@pytest.mark.parametrize(("values", "status_code"), [({"status": "shipped"}, 409), ({"status": "submitted"}, 404)])
async def test_votes_only_on_active_public_stories(
    client: AsyncClient, db: AsyncSession, values: dict[str, Any], status_code: int
) -> None:
    story = await make_story(db, **values)
    assert (await client.post(f"{URL}/{story.id}/vote", json=_vote_body())).status_code == status_code


async def test_no_vote_on_a_hidden_story(client: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db)
    story.hidden_at = story.created_at
    await db.flush()
    assert (await client.post(f"{URL}/{story.id}/vote", json=_vote_body())).status_code == 404


async def test_vote_rate_limit(client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wow_features.vote_limiter, "_config", _BucketConfig(2, 3600))
    story = await make_story(db)
    me = uuid.uuid4()
    assert (await client.post(f"{URL}/{story.id}/vote", json=_vote_body(me))).status_code == 200
    assert (await client.request("DELETE", f"{URL}/{story.id}/vote", json=_vote_body(me))).status_code == 200
    resp = await client.post(f"{URL}/{story.id}/vote", json=_vote_body(me))
    assert resp.status_code == 429
    assert "retry-after" in resp.headers


# --- Serve-only (production shape) ------------------------------------------------


async def test_public_routes_in_serve_only(
    serve_only_client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # In production one env drives both the app and the module settings the gates read.
    monkeypatch.setattr(settings, "serve_only", True)
    story = await make_story(db)
    assert (await serve_only_client.get(URL)).status_code == 200
    assert (await serve_only_client.post(f"{URL}/{story.id}/vote", json=_vote_body())).status_code == 200
    # Anonymous deployment without a Turnstile secret: submitting is off.
    fake = fake_client()
    with patch(BUILD_CLIENT, return_value=fake):
        resp = await serve_only_client.post(URL, json=submit_body())
    fake.messages.create.assert_not_called()
    assert resp.status_code == 503
    assert resp.json()["detail"] == "feature_requests_unavailable"


async def test_serve_only_submit_with_turnstile(monkeypatch: pytest.MonkeyPatch, bound_unit_of_work: AsyncSession) -> None:
    monkeypatch.setattr(settings, "turnstile_secret_key", "secret")
    monkeypatch.setattr(settings, "serve_only", True)
    serve_app = create_app(settings.model_copy(update={"serve_only": True}))
    verify = AsyncMock(return_value=(True, []))
    async with AsyncClient(transport=ASGITransport(app=serve_app), base_url="http://test") as ac:
        with patch(VERIFY_TURNSTILE, verify), patch(BUILD_CLIENT, return_value=fake_client(tool_input=story_tool_input())):
            missing = await ac.post(URL, json=submit_body())
            ok = await ac.post(URL, json=submit_body(), headers={"X-Turnstile-Token": "tok"})
    assert missing.status_code == 400
    assert ok.status_code == 200 and ok.json()["verdict"] == "new"
