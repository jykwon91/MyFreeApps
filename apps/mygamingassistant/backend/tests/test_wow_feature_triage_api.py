"""Triage API: token gate, mounting, If-Match, audit actor, PATCH, merge, inbox.

Each test builds its own app from a settings copy carrying the triage tokens
(the router is mounted at app build time), bound to the SAVEPOINT test session
exactly like the shared ``client`` fixture.
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pydantic
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.rate_limit import _BucketConfig

from app.core import triage_gate
from app.core.audit import current_user_id
from app.core.config import Settings, settings
from app.core.triage_tokens import parse_triage_tokens
from app.db.session import get_db
from app.main import create_app
from app.models.wow.feature_story import WowFeatureStory
from app.models.wow.feature_submission import WowFeatureSubmission
from app.models.wow.feature_vote import WowFeatureVote
from app.schemas.wow.feature_requests.triage_mark_triaged_result import TriageMarkTriagedResult
from app.services.wow.feature_requests import feature_triage_service

from wow_feature_helpers import TRIAGE_URL, URL, iso, make_story, make_submission, reset_limiters

CLI_TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789"
OPS_TOKEN = "ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210"
TOKENS = f"cli:{CLI_TOKEN},ops:{OPS_TOKEN}"
HEADER = "X-MGA-Triage-Token"
CLI = {HEADER: CLI_TOKEN}
UNKNOWN_ROUTE = {"detail": "Not Found"}


@pytest.fixture(autouse=True)
def _fresh_limiters():
    reset_limiters()
    yield
    reset_limiters()


async def _client_for(app_settings: Settings, db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    app = create_app(app_settings)

    async def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def triage(db: AsyncSession, bound_unit_of_work: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async for ac in _client_for(settings.model_copy(update={"wow_feature_triage_token": TOKENS}), db):
        yield ac


@pytest_asyncio.fixture
async def triage_serve_only(db: AsyncSession, bound_unit_of_work: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    update = {"wow_feature_triage_token": TOKENS, "serve_only": True}
    async for ac in _client_for(settings.model_copy(update=update), db):
        yield ac


def _version(story: WowFeatureStory) -> dict[str, str]:
    return {**CLI, "If-Match": iso(story.updated_at)}


async def _patch(triage: AsyncClient, story: WowFeatureStory, body: dict[str, object]):
    return await triage.patch(f"{TRIAGE_URL}/stories/{story.id}", json=body, headers=_version(story))


async def _merge(triage: AsyncClient, source: WowFeatureStory, target: WowFeatureStory):
    return await triage.post(
        f"{TRIAGE_URL}/stories/{source.id}/merge", json={"into_story_id": str(target.id)}, headers=_version(source)
    )


# --- Mounting + token gate ------------------------------------------------------


async def test_not_mounted_without_a_token(client: AsyncClient) -> None:
    unknown = await client.get("/api/no-such-route")
    for resp in (await client.get(f"{TRIAGE_URL}/inbox"), await client.get(f"{TRIAGE_URL}/inbox", headers=CLI)):
        assert resp.status_code == 404
        assert resp.json() == unknown.json() == UNKNOWN_ROUTE
        assert resp.headers["cache-control"] == "no-store"


async def test_not_mounted_in_serve_only_without_a_token(serve_only_client: AsyncClient) -> None:
    assert (await serve_only_client.get(f"{TRIAGE_URL}/inbox", headers=CLI)).status_code == 404


async def test_mounted_in_serve_only_with_a_token(triage_serve_only: AsyncClient) -> None:
    resp = await triage_serve_only.get(f"{TRIAGE_URL}/inbox", headers=CLI)
    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("headers", [{}, {HEADER: "wrong"}, {HEADER: CLI_TOKEN[:-1]}, {"Authorization": CLI_TOKEN}])
async def test_wrong_or_missing_token_looks_unmounted(
    triage: AsyncClient, headers: dict[str, str], caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING):
        resp = await triage.get(f"{TRIAGE_URL}/inbox", headers=headers)
    assert resp.status_code == 404
    assert resp.json() == UNKNOWN_ROUTE
    assert resp.headers["cache-control"] == "no-store"
    assert "wow feature triage: rejected token" in caplog.text
    assert CLI_TOKEN not in caplog.text and CLI_TOKEN[:-1] not in caplog.text


async def test_token_in_the_query_string_is_ignored(triage: AsyncClient) -> None:
    resp = await triage.get(f"{TRIAGE_URL}/inbox", params={"token": CLI_TOKEN})
    assert resp.status_code == 404


async def test_wrong_key_with_a_malformed_body_is_still_404(triage: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db)
    resp = await triage.patch(
        f"{TRIAGE_URL}/stories/{story.id}", content=b"{not json", headers={HEADER: "wrong", "If-Match": "x"}
    )
    assert resp.status_code == 404
    assert resp.json() == UNKNOWN_ROUTE


async def test_both_labelled_tokens_work(triage: AsyncClient) -> None:
    assert (await triage.get(f"{TRIAGE_URL}/inbox", headers=CLI)).status_code == 200
    assert (await triage.get(f"{TRIAGE_URL}/inbox", headers={HEADER: OPS_TOKEN})).status_code == 200


async def test_failed_auth_lockout(triage: AsyncClient) -> None:
    for _ in range(10):
        assert (await triage.get(f"{TRIAGE_URL}/inbox", headers={HEADER: "wrong"})).status_code == 404
    locked = await triage.get(f"{TRIAGE_URL}/inbox", headers=CLI)
    assert locked.status_code == 429
    assert int(locked.headers["retry-after"]) > 0
    assert locked.headers["cache-control"] == "no-store"
    # Another IP is unaffected.
    other = await triage.get(f"{TRIAGE_URL}/inbox", headers={**CLI, "X-Forwarded-For": "203.0.113.7"})
    assert other.status_code == 200


async def test_failed_auth_does_not_touch_public_routes(triage: AsyncClient) -> None:
    for _ in range(11):
        await triage.get(f"{TRIAGE_URL}/inbox", headers={HEADER: "wrong"})
    board = await triage.get(URL)
    assert board.status_code == 200
    assert "no-store" not in board.headers.get("cache-control", "")


async def test_authenticated_rate_limit(triage: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(triage_gate.triage_request_limiter, "_config", _BucketConfig(2, 60))
    statuses = [(await triage.get(f"{TRIAGE_URL}/inbox", headers=CLI)).status_code for _ in range(3)]
    assert statuses == [200, 200, 429]


async def test_request_logs_never_carry_the_token(triage: AsyncClient, caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.DEBUG):
        await triage.get(f"{TRIAGE_URL}/inbox", headers=CLI)
        await triage.get(f"{TRIAGE_URL}/inbox", headers={HEADER: OPS_TOKEN[:-2]})
    assert "GET /api/wow/feature-requests/triage/inbox 200" in caplog.text
    assert CLI_TOKEN not in caplog.text and OPS_TOKEN[:-2] not in caplog.text


def test_mga_has_no_sentry_that_would_need_header_scrubbing() -> None:
    """If Sentry is ever added to MGA, its scrubber must drop X-MGA-Triage-Token."""
    main_source = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(encoding="utf-8")
    for marker in ("sentry_sdk", "init_sentry"):
        assert marker not in main_source, "add X-MGA-Triage-Token to Sentry's header scrubbing"


# --- Boot validation ----------------------------------------------------------------


@pytest.mark.parametrize(
    "raw",
    [
        "short",
        "a" * 40,  # long but one distinct character
        f"Bad Label:{CLI_TOKEN}",
        f"{'x' * 21}:{CLI_TOKEN}",
        f"cli:{CLI_TOKEN},cli:{OPS_TOKEN}",
        f"cli:{CLI_TOKEN},{OPS_TOKEN},{CLI_TOKEN}9",  # two bare tokens = two "default" labels
    ],
)
def test_bad_tokens_fail_loud(raw: str) -> None:
    with pytest.raises(ValueError) as exc:
        parse_triage_tokens(raw)
    assert CLI_TOKEN not in str(exc.value) and OPS_TOKEN not in str(exc.value)
    with pytest.raises(pydantic.ValidationError):
        Settings(wow_feature_triage_token=raw)


def test_token_parsing() -> None:
    assert parse_triage_tokens("") == ()
    bare = parse_triage_tokens(f" {CLI_TOKEN} ")
    assert [(t.label, t.token) for t in bare] == [("default", CLI_TOKEN)]
    labelled = parse_triage_tokens(f"cli:{CLI_TOKEN}, ops:{OPS_TOKEN},")
    assert [t.label for t in labelled] == ["cli", "ops"]


# --- If-Match ---------------------------------------------------------------------


async def test_if_match_is_required(triage: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db)
    url = f"{TRIAGE_URL}/stories/{story.id}"
    missing = await triage.patch(url, json={"priority": 1}, headers=CLI)
    assert missing.status_code == 428 and missing.json()["detail"] == "if_match_required"
    bad = await triage.patch(url, json={"priority": 1}, headers={**CLI, "If-Match": "yesterday"})
    assert bad.status_code == 400 and bad.json()["detail"] == "invalid_if_match"
    naive = await triage.patch(url, json={"priority": 1}, headers={**CLI, "If-Match": "2026-11-01T10:00:00"})
    assert naive.status_code == 400
    stale = await triage.patch(
        url, json={"priority": 1}, headers={**CLI, "If-Match": iso(story.updated_at - timedelta(seconds=1))}
    )
    assert stale.status_code == 412 and stale.json()["detail"] == "story_changed"


async def test_if_match_accepts_quoted_and_weak_forms(triage: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db)
    resp = await triage.patch(
        f"{TRIAGE_URL}/stories/{story.id}", json={"priority": 2}, headers={**CLI, "If-Match": f'W/"{iso(story.updated_at)}"'}
    )
    assert resp.status_code == 200


async def test_patch_returns_the_new_version(triage: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db)
    old_version = iso(story.updated_at)
    data = (await _patch(triage, story, {"priority": 1})).json()
    assert data["updated_at"] != old_version
    stale = await triage.patch(
        f"{TRIAGE_URL}/stories/{story.id}", json={"priority": 2}, headers={**CLI, "If-Match": old_version}
    )
    assert stale.status_code == 412
    fresh = await triage.patch(
        f"{TRIAGE_URL}/stories/{story.id}", json={"priority": 2}, headers={**CLI, "If-Match": data["updated_at"]}
    )
    assert fresh.status_code == 200


async def test_merge_requires_the_source_version(triage: AsyncClient, db: AsyncSession) -> None:
    source, target = await make_story(db), await make_story(db, title="Target")
    url = f"{TRIAGE_URL}/stories/{source.id}/merge"
    body = {"into_story_id": str(target.id)}
    assert (await triage.post(url, json=body, headers=CLI)).status_code == 428
    stale = {**CLI, "If-Match": iso(source.updated_at - timedelta(seconds=1))}
    assert (await triage.post(url, json=body, headers=stale)).status_code == 412


# --- Audit actor + logs ---------------------------------------------------------------


async def test_audit_actor_is_the_token_label(triage: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str | None] = []

    async def capture(submission_ids: object, *, actor: str) -> TriageMarkTriagedResult:
        seen.append(current_user_id.get())
        seen.append(actor)
        return TriageMarkTriagedResult(marked=0)

    monkeypatch.setattr(feature_triage_service, "mark_triaged", capture)
    body = {"submission_ids": [str(uuid.uuid4())]}
    await triage.post(f"{TRIAGE_URL}/submissions/mark-triaged", json=body, headers=CLI)
    await triage.post(f"{TRIAGE_URL}/submissions/mark-triaged", json=body, headers={HEADER: OPS_TOKEN})
    assert seen == ["triage:cli", "cli", "triage:ops", "ops"]
    assert current_user_id.get() != "triage:cli"


async def test_writes_log_actor_ids_and_status_never_text(
    triage: AsyncClient, db: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    story = await make_story(db, status="submitted")
    with caplog.at_level(logging.INFO):
        await _patch(triage, story, {"status": "open", "operator_note": "secret operator words"})
    assert f"actor=cli action=patch story={story.id} status=submitted->open" in caplog.text
    assert "secret operator words" not in caplog.text
    assert CLI_TOKEN not in caplog.text


# --- PATCH ------------------------------------------------------------------------------


async def test_patch_publishes_and_edits(triage: AsyncClient, client: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db, status="submitted")
    data = (
        await _patch(
            triage,
            story,
            {"status": "open", "title": "  Alchemy   route  ", "topic": "Alchemy", "priority": 1, "operator_note": "Soon"},
        )
    ).json()
    assert data["status"] == "open" and data["title"] == "Alchemy route" and data["topic"] == "alchemy"
    assert data["priority"] == 1
    public = (await client.get(f"{URL}/{story.id}")).json()
    assert public["title"] == "Alchemy route" and public["operator_note"] == "Soon"
    assert "priority" not in public


async def test_patch_shipped_sets_and_clears_shipped_at(triage: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db)
    shipped = (await _patch(triage, story, {"status": "shipped", "shipped_path": "/wow-forever/professions"})).json()
    assert shipped["shipped_at"] is not None and shipped["shipped_path"] == "/wow-forever/professions"
    reopened = (
        await triage.patch(
            f"{TRIAGE_URL}/stories/{story.id}",
            json={"status": "in_progress"},
            headers={**CLI, "If-Match": shipped["updated_at"]},
        )
    ).json()
    assert reopened["shipped_at"] is None


async def test_patch_hide_takes_a_story_down(triage: AsyncClient, client: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db)
    data = (await _patch(triage, story, {"hidden": True})).json()
    assert data["hidden"] is True
    assert (await client.get(f"{URL}/{story.id}")).status_code == 404
    shown = await triage.patch(
        f"{TRIAGE_URL}/stories/{story.id}", json={"hidden": False}, headers={**CLI, "If-Match": data["updated_at"]}
    )
    assert shown.json()["hidden"] is False
    assert (await client.get(f"{URL}/{story.id}")).status_code == 200


@pytest.mark.parametrize(
    "body",
    [
        {"title": "see https://evil.example"},
        {"operator_note": "<b>hi</b>"},
        {"acceptance_criteria": ["Given x, then [click](here)"]},
        {"follow_ups": ["ask @someone"]},
        {"title": "   "},
    ],
)
async def test_patch_text_goes_through_the_output_filter(
    triage: AsyncClient, db: AsyncSession, body: dict[str, object]
) -> None:
    story = await make_story(db)
    assert (await _patch(triage, story, body)).status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        {"status": "duplicate"},
        {"merged_into_id": str(uuid.uuid4())},
        {"vote_count": 99},
        {"title": None},
        {"shipped_path": "https://evil.example"},
        {"shipped_path": "/admin"},
        {"priority": 0},
        {"area": "mythic_plus"},
    ],
)
async def test_patch_allowlist(triage: AsyncClient, db: AsyncSession, body: dict[str, object]) -> None:
    story = await make_story(db)
    assert (await _patch(triage, story, body)).status_code == 422


async def test_patch_unknown_story_and_merged_story(triage: AsyncClient, db: AsyncSession) -> None:
    missing = await triage.patch(
        f"{TRIAGE_URL}/stories/{uuid.uuid4()}", json={"priority": 1}, headers={**CLI, "If-Match": iso(datetime.now(timezone.utc))}
    )
    assert missing.status_code == 404
    target = await make_story(db)
    merged = await make_story(db, status="duplicate", merged_into_id=target.id)
    resp = await _patch(triage, merged, {"priority": 1})
    assert resp.status_code == 409 and resp.json()["detail"] == "status_conflict"


# --- Merge --------------------------------------------------------------------------------


async def _vote(db: AsyncSession, story: WowFeatureStory, voter: str, *, ip_hash: str = "ab") -> None:
    db.add(WowFeatureVote(story_id=story.id, voter_key=voter * 64, ip_hash=ip_hash * 32, source="vote"))
    story.vote_count += 1
    await db.flush()


async def test_merge_moves_votes_once_per_voter(triage: AsyncClient, client: AsyncClient, db: AsyncSession) -> None:
    source, target = await make_story(db, title="Source"), await make_story(db, title="Target")
    await _vote(db, source, "a")
    await _vote(db, source, "b")
    await _vote(db, target, "b")
    await _vote(db, target, "c")
    data = (await _merge(triage, source, target)).json()
    assert data["source"]["status"] == "duplicate"
    assert data["source"]["merged_into_id"] == str(target.id)
    assert data["source"]["vote_count"] == 0
    assert data["target"]["vote_count"] == 3
    voters = (await db.scalars(select(WowFeatureVote.voter_key).where(WowFeatureVote.story_id == target.id))).all()
    assert sorted(voters) == ["a" * 64, "b" * 64, "c" * 64]
    left = await db.scalar(select(func.count()).select_from(WowFeatureVote).where(WowFeatureVote.story_id == source.id))
    assert left == 0
    assert (await client.get(f"{URL}/{source.id}")).json() == {"merged_into_id": str(target.id)}


async def test_merge_flattens_children_and_moves_submissions(triage: AsyncClient, db: AsyncSession) -> None:
    source, target = await make_story(db), await make_story(db, title="Target")
    child = await make_story(db, status="duplicate", merged_into_id=source.id)
    submission = await make_submission(db, verdict="new", story_id=source.id)
    data = (await _merge(triage, source, target)).json()
    await db.refresh(child)
    await db.refresh(submission)
    assert child.merged_into_id == target.id
    assert submission.story_id == target.id
    assert str(submission.id) in {s["submission_id"] for s in data["target"]["submissions"]}


async def test_merge_conflicts(triage: AsyncClient, db: AsyncSession) -> None:
    story, other = await make_story(db), await make_story(db, title="Other")
    self_merge = await _merge(triage, story, story)
    assert self_merge.status_code == 409 and self_merge.json()["detail"] == "merge_conflict"
    merged_target = await make_story(db, status="duplicate", merged_into_id=other.id)
    assert (await _merge(triage, story, merged_target)).status_code == 409
    already = await make_story(db, status="duplicate", merged_into_id=other.id)
    assert (await _merge(triage, already, story)).status_code == 409
    unknown = await triage.post(
        f"{TRIAGE_URL}/stories/{story.id}/merge", json={"into_story_id": str(uuid.uuid4())}, headers=_version(story)
    )
    assert unknown.status_code == 404


# --- Inbox, stories, mark-triaged -------------------------------------------------------


async def test_inbox_includes_every_untriaged_verdict(triage: AsyncClient, db: AsyncSession) -> None:
    story = await make_story(db, status="submitted", priority=2)
    new = await make_submission(db, verdict="new", story_id=story.id, raw_text="Please add an alchemy route")
    rejected = await make_submission(db, verdict="rejected", reason="Spam", raw_text="buy gold now please")
    asked = await make_submission(db, verdict="needs_clarification", reason="Which one?", raw_text="add a guide")
    await make_submission(db, verdict="rejected", triaged_at=story.created_at, raw_text="already handled text")

    data = (await triage.get(f"{TRIAGE_URL}/inbox", headers=CLI)).json()
    assert data["total_untriaged"] == 3
    by_id = {item["submission_id"]: item for item in data["items"]}
    assert set(by_id) == {str(new.id), str(rejected.id), str(asked.id)}
    assert by_id[str(rejected.id)]["claude_reason"] == "Spam"
    assert by_id[str(rejected.id)]["untrusted_submission_text"] == "buy gold now please"
    assert by_id[str(asked.id)]["verdict"] == "needs_clarification"
    linked = by_id[str(new.id)]["story"]
    assert linked["id"] == str(story.id) and linked["priority"] == 2 and linked["updated_at"]
    assert "raw_text" not in by_id[str(new.id)] and "ip_hash" not in by_id[str(new.id)]


async def test_inbox_total_beyond_the_page(
    triage: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(feature_triage_service, "TRIAGE_INBOX_MAX", 2)
    for index in range(3):
        await make_submission(db, raw_text=f"request number {index} here")
    data = (await triage.get(f"{TRIAGE_URL}/inbox", headers=CLI)).json()
    assert len(data["items"]) == 2 and data["total_untriaged"] == 3


async def test_stories_include_private_ones_and_filter(triage: AsyncClient, db: AsyncSession) -> None:
    await make_story(db, title="Private", status="submitted")
    await make_story(db, title="Public")
    everything = (await triage.get(f"{TRIAGE_URL}/stories", headers=CLI)).json()
    assert {s["title"] for s in everything["items"]} == {"Private", "Public"}
    submitted = (await triage.get(f"{TRIAGE_URL}/stories", params={"status": "submitted"}, headers=CLI)).json()
    assert [s["title"] for s in submitted["items"]] == ["Private"]


async def test_mark_triaged(triage: AsyncClient, db: AsyncSession) -> None:
    first = await make_submission(db, raw_text="first request text")
    second = await make_submission(db, raw_text="second request text")
    body = {"submission_ids": [str(first.id), str(uuid.uuid4())]}
    assert (await triage.post(f"{TRIAGE_URL}/submissions/mark-triaged", json=body, headers=CLI)).json() == {"marked": 1}
    assert (await triage.post(f"{TRIAGE_URL}/submissions/mark-triaged", json=body, headers=CLI)).json() == {"marked": 0}
    data = (await triage.get(f"{TRIAGE_URL}/inbox", headers=CLI)).json()
    assert [item["submission_id"] for item in data["items"]] == [str(second.id)]
    untriaged = await db.scalar(
        select(func.count()).select_from(WowFeatureSubmission).where(WowFeatureSubmission.triaged_at.is_(None))
    )
    assert untriaged == 1
