"""Platform-invite end-to-end coverage.

Covers the full state machine plus the security-hardening invariants
landed in PR fix/myjobhunter-invite-security-hardening:

  State machine:
    * admin creates invite (201) → public preview returns email + status
    * non-admin POST /admin/invites → 403
    * duplicate email while a pending invite exists → 409 (generic)
    * email already a registered user → 409 (generic — same body)
    * accept with matching email → invite consumed (accepted_at set)
    * accept twice → 409 already accepted
    * accept after expiry → 410 gone
    * accept with wrong logged-in user → 400 email mismatch
    * cancel un-accepted → 204 → re-cancel → 404
    * cancel an accepted invite → 409

  Security invariants (one test per audit finding):
    * Raw token never leaves the API surface (no `token` field on
      InviteRead, no `token` in cancel/list responses).
    * The DB persists only the sha256 hash, never the raw value.
    * Audit-log metadata uses email_domain only on create — never
      the full recipient email.
    * The 409 collision response collapses "user exists" / "pending
      invite" into a single generic body, so an admin token compromise
      cannot enumerate the auth state of an arbitrary email.
    * The public preview is per-IP rate-limited.

The unit-of-work fixture in conftest commits user-factory rows in a
fresh engine, so the `is_verified=True` flip persists across the
service's `unit_of_work` boundary the way it does in production.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.services.platform.invite_token import hash_token


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _promote_to_admin(email: str) -> None:
    """Flip user's role to admin via a fresh engine.

    Required because the in-test transaction (rolled back at teardown)
    can't be observed by ``unit_of_work`` sessions opened inside the
    service layer — same pattern as the verified flag in user_factory.
    """
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as sess:
        async with sess.begin():
            await sess.execute(
                text("UPDATE users SET role = 'admin' WHERE email = :email"),
                {"email": email},
            )
    await engine.dispose()


async def _force_invite_expired(invite_id: str) -> None:
    """Backdate ``expires_at`` so accept-after-expiry is testable."""
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as sess:
        async with sess.begin():
            await sess.execute(
                text(
                    "UPDATE platform_invites "
                    "SET expires_at = :ts WHERE id = :id"
                ),
                {
                    "ts": datetime.now(timezone.utc) - timedelta(hours=1),
                    "id": invite_id,
                },
            )
    await engine.dispose()


async def _delete_invite_rows() -> None:
    """Clean up any platform_invites rows left by tests."""
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as sess:
        async with sess.begin():
            await sess.execute(text("DELETE FROM platform_invites"))
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_invites():
    yield
    await _delete_invite_rows()


@pytest.fixture
def captured_invites():
    """Patch the email sender and capture (email, raw_token) tuples.

    The raw token never appears in any HTTP response — this is the only
    way a test can obtain the token to drive the accept-flow assertions.
    Mirrors how a real recipient gets their token (email inbox).
    """
    captured: list[tuple[str, str]] = []

    def _record(recipient_email: str, token: str) -> None:
        captured.append((recipient_email, token))

    # Patch in BOTH the module that defines it and the module that
    # imports it for use, because Python resolves the name at the
    # imported module's scope. The route layer uses
    # ``app.services.platform.invite_email.send_invite_email`` via the
    # ``app.api.admin_invites`` import; patching the source module is
    # not enough.
    with patch(
        "app.api.admin_invites.send_invite_email", side_effect=_record,
    ):
        yield captured


def _last_token_for(captured: list[tuple[str, str]], email: str) -> str:
    """Find the raw token most recently emitted to ``email``."""
    for recipient, tok in reversed(captured):
        if recipient.lower() == email.lower():
            return tok
    raise AssertionError(f"No invite captured for {email!r} (have {captured!r})")


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_admin_cannot_create_invite(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    regular = await user_factory()
    async with await as_user(regular) as authed:
        resp = await authed.post(
            "/admin/invites", json={"email": "candidate@example.com"},
        )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_anonymous_cannot_create_invite(
    client: AsyncClient, captured_invites,
) -> None:
    resp = await client.post(
        "/admin/invites", json={"email": "candidate@example.com"},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Create invite
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_creates_invite_returns_201_without_token(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    """Create response must NOT contain the raw token.

    Security invariant: tokens are emitted exactly once, via email.
    Returning the token in the API response would let any
    compromised-admin session bypass the email step entirely.
    """
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        resp = await authed.post(
            "/admin/invites", json={"email": "newuser@example.com"},
        )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["email"] == "newuser@example.com"
    assert body["status"] == "pending"
    assert "token" not in body, "Raw token must not appear in API response"
    assert body["accepted_at"] is None
    assert body["accepted_by"] is None
    # Email send was invoked with the recipient + a non-empty token
    assert len(captured_invites) == 1
    sent_to, sent_token = captured_invites[0]
    assert sent_to == "newuser@example.com"
    assert sent_token  # non-empty


@pytest.mark.asyncio
async def test_create_invite_persists_only_token_hash(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    """DB row stores sha256(raw_token), never the raw token.

    Direct DB inspection: the row's ``token_hash`` must equal the hash
    of the captured raw token, and there must be NO ``token`` column on
    the row (a leftover from the pre-hardening migration).
    """
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        await authed.post(
            "/admin/invites", json={"email": "hashcheck@example.com"},
        )
    sent_token = _last_token_for(captured_invites, "hashcheck@example.com")

    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as sess:
        result = await sess.execute(
            text(
                "SELECT token_hash FROM platform_invites "
                "WHERE email = :e"
            ),
            {"e": "hashcheck@example.com"},
        )
        row_hash = result.scalar_one()
        # The legacy ``token`` column from inv260505 must be gone
        cols_result = await sess.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'platform_invites'"
            )
        )
        columns = {r[0] for r in cols_result}
    await engine.dispose()

    assert row_hash == hash_token(sent_token)
    assert "token" not in columns, (
        "Legacy plaintext `token` column must be dropped"
    )
    assert "token_hash" in columns


@pytest.mark.asyncio
async def test_create_invite_lowercases_email(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        resp = await authed.post(
            "/admin/invites", json={"email": "MixedCase@Example.com"},
        )
    assert resp.status_code == 201
    assert resp.json()["email"] == "mixedcase@example.com"


@pytest.mark.asyncio
async def test_create_invite_for_existing_user_returns_generic_409(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    """Generic body — no hint that the email is already a user.

    Security invariant: a compromised admin session must not be able to
    enumerate which arbitrary emails already have accounts.
    """
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    existing = await user_factory()  # already registered
    async with await as_user(admin) as authed:
        resp = await authed.post(
            "/admin/invites", json={"email": existing["email"]},
        )
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail == "Cannot send invite to this email."


@pytest.mark.asyncio
async def test_create_invite_duplicate_pending_returns_generic_409(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    """Same generic body as the user-exists branch."""
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        first = await authed.post(
            "/admin/invites", json={"email": "dupe@example.com"},
        )
        assert first.status_code == 201
        second = await authed.post(
            "/admin/invites", json={"email": "dupe@example.com"},
        )
    assert second.status_code == 409
    assert second.json()["detail"] == "Cannot send invite to this email."


# ---------------------------------------------------------------------------
# List + cancel
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_pending_returns_only_unaccepted(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        await authed.post("/admin/invites", json={"email": "a@example.com"})
        await authed.post("/admin/invites", json={"email": "b@example.com"})
        list_resp = await authed.get("/admin/invites")
    assert list_resp.status_code == 200
    data = list_resp.json()
    assert len(data) == 2
    assert {row["email"] for row in data} == {"a@example.com", "b@example.com"}
    # Token must not leak via list either
    assert all("token" not in row for row in data)


@pytest.mark.asyncio
async def test_cancel_unaccepted_invite_returns_204(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": "cancelme@example.com"},
        )
        invite_id = create.json()["id"]
        cancel = await authed.delete(f"/admin/invites/{invite_id}")
    assert cancel.status_code == 204


@pytest.mark.asyncio
async def test_cancel_unknown_invite_returns_404(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        resp = await authed.delete(f"/admin/invites/{uuid.uuid4()}")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Public preview
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_public_preview_pending(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        await authed.post(
            "/admin/invites", json={"email": "preview@example.com"},
        )
    token = _last_token_for(captured_invites, "preview@example.com")

    info = await client.get(f"/invites/{token}/info")
    assert info.status_code == 200
    body = info.json()
    assert body["email"] == "preview@example.com"
    assert body["status"] == "pending"
    # Inviter identity must NOT leak via the public preview.
    assert "created_by" not in body
    assert "inviter_name" not in body


@pytest.mark.asyncio
async def test_public_preview_unknown_token_returns_404(
    client: AsyncClient,
) -> None:
    resp = await client.get("/invites/not-a-real-token/info")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_public_preview_expired_invite(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": "expired@example.com"},
        )
    body = create.json()
    await _force_invite_expired(body["id"])
    token = _last_token_for(captured_invites, "expired@example.com")

    info = await client.get(f"/invites/{token}/info")
    assert info.status_code == 200
    assert info.json()["status"] == "expired"


@pytest.mark.asyncio
async def test_public_preview_rate_limit_blocks_after_threshold(
    client: AsyncClient,
) -> None:
    """30/5min throttle on the unauthenticated info endpoint.

    Sends 31 distinct-token lookups from the same source IP and asserts
    the last one returns 429. Resets the limiter at teardown so other
    tests aren't affected.
    """
    from app.api import admin_invites

    # Save + reset — important because the limiter is process-global.
    saved = admin_invites._INVITE_INFO_LIMITER
    fresh = admin_invites.RateLimiter(max_attempts=30, window_seconds=300)
    admin_invites._INVITE_INFO_LIMITER = fresh
    try:
        rate_limited = False
        for i in range(31):
            r = await client.get(f"/invites/probe-{i}-{uuid.uuid4().hex}/info")
            if r.status_code == 429:
                rate_limited = True
                break
        assert rate_limited, "30/5min limit should have fired before request 31"
    finally:
        admin_invites._INVITE_INFO_LIMITER = saved


# ---------------------------------------------------------------------------
# Accept
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_accept_invite_with_matching_email(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    invitee_email = f"accept-{uuid.uuid4().hex[:8]}@example.com"
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": invitee_email},
        )
    invite_id = create.json()["id"]
    token = _last_token_for(captured_invites, invitee_email)

    invitee = await user_factory(email=invitee_email)
    async with await as_user(invitee) as authed_invitee:
        accept = await authed_invitee.post(f"/invites/{token}/accept")
    assert accept.status_code == 200, accept.text
    body = accept.json()
    assert body["invite_id"] == invite_id
    assert body["accepted_at"]


@pytest.mark.asyncio
async def test_accept_invite_email_mismatch_returns_400(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        await authed.post(
            "/admin/invites", json={"email": "intended@example.com"},
        )
    token = _last_token_for(captured_invites, "intended@example.com")

    impostor = await user_factory()  # different random email
    async with await as_user(impostor) as authed_impostor:
        resp = await authed_impostor.post(f"/invites/{token}/accept")
    assert resp.status_code == 400
    assert "not for the signed-in account" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_accept_invite_twice_returns_409(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    invitee_email = f"twice-{uuid.uuid4().hex[:8]}@example.com"
    async with await as_user(admin) as authed:
        await authed.post(
            "/admin/invites", json={"email": invitee_email},
        )
    token = _last_token_for(captured_invites, invitee_email)

    invitee = await user_factory(email=invitee_email)
    async with await as_user(invitee) as authed_invitee:
        first = await authed_invitee.post(f"/invites/{token}/accept")
        second = await authed_invitee.post(f"/invites/{token}/accept")
    assert first.status_code == 200
    assert second.status_code == 409
    assert "already" in second.json()["detail"].lower()


@pytest.mark.asyncio
async def test_accept_expired_invite_returns_410(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    invitee_email = f"expired-{uuid.uuid4().hex[:8]}@example.com"
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": invitee_email},
        )
    create_body = create.json()
    await _force_invite_expired(create_body["id"])
    token = _last_token_for(captured_invites, invitee_email)

    invitee = await user_factory(email=invitee_email)
    async with await as_user(invitee) as authed_invitee:
        resp = await authed_invitee.post(f"/invites/{token}/accept")
    assert resp.status_code == 410


@pytest.mark.asyncio
async def test_accept_unknown_token_returns_404(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    user = await user_factory()
    async with await as_user(user) as authed:
        resp = await authed.post("/invites/no-such-token/accept")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_accept_requires_auth(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        await authed.post(
            "/admin/invites", json={"email": "needsauth@example.com"},
        )
    token = _last_token_for(captured_invites, "needsauth@example.com")
    # No auth header
    resp = await client.post(f"/invites/{token}/accept")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_cancel_accepted_invite_returns_409(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    invitee_email = f"acc-cancel-{uuid.uuid4().hex[:8]}@example.com"
    async with await as_user(admin) as authed:
        create = await authed.post(
            "/admin/invites", json={"email": invitee_email},
        )
    create_body = create.json()
    invite_id = create_body["id"]
    token = _last_token_for(captured_invites, invitee_email)

    invitee = await user_factory(email=invitee_email)
    async with await as_user(invitee) as authed_invitee:
        await authed_invitee.post(f"/invites/{token}/accept")

    async with await as_user(admin) as authed_admin:
        cancel = await authed_admin.delete(f"/admin/invites/{invite_id}")
    assert cancel.status_code == 409


# ---------------------------------------------------------------------------
# Audit-event redaction (security invariant)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_invite_audit_log_uses_email_domain_only(
    client: AsyncClient, user_factory, as_user, captured_invites,
) -> None:
    """Auth-event metadata on create must NOT contain the recipient's
    full email — only ``email_domain``.

    Reason: the recipient is by definition not yet a user, so per the
    auth-events policy for unknown-user events we keep PII out of
    operator-readable logs.
    """
    admin = await user_factory()
    await _promote_to_admin(admin["email"])
    async with await as_user(admin) as authed:
        await authed.post(
            "/admin/invites", json={"email": "fred@redactme.example.com"},
        )

    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as sess:
        result = await sess.execute(
            text(
                "SELECT metadata FROM auth_events "
                "WHERE event_type = 'platform_invite.created' "
                "ORDER BY created_at DESC LIMIT 1"
            ),
        )
        row = result.first()
    await engine.dispose()
    assert row is not None, "audit row must be present"
    metadata = row[0]
    assert metadata.get("email_domain") == "redactme.example.com"
    assert "email" not in metadata, (
        "full email must not appear in audit metadata"
    )
    assert "fred" not in str(metadata), (
        "local-part of recipient email must not leak"
    )


# ---------------------------------------------------------------------------
# Status helper unit tests (no DB)
# ---------------------------------------------------------------------------


def test_compute_status_returns_pending_for_fresh_invite() -> None:
    from app.models.platform.invite import PlatformInvite
    from app.schemas.platform.invite_status import InviteStatus
    from app.services.platform.invite_service import compute_status

    now = datetime.now(timezone.utc)
    invite = PlatformInvite(
        email="x@example.com",
        token_hash=hash_token("t"),
        expires_at=now + timedelta(days=7),
        accepted_at=None,
        created_by=uuid.uuid4(),
    )
    assert compute_status(invite, now=now) == InviteStatus.PENDING


def test_compute_status_returns_accepted_when_accepted_at_set() -> None:
    from app.models.platform.invite import PlatformInvite
    from app.schemas.platform.invite_status import InviteStatus
    from app.services.platform.invite_service import compute_status

    now = datetime.now(timezone.utc)
    invite = PlatformInvite(
        email="x@example.com",
        token_hash=hash_token("t"),
        expires_at=now + timedelta(days=7),
        accepted_at=now,
        created_by=uuid.uuid4(),
    )
    assert compute_status(invite, now=now) == InviteStatus.ACCEPTED


def test_compute_status_returns_expired_past_deadline() -> None:
    from app.models.platform.invite import PlatformInvite
    from app.schemas.platform.invite_status import InviteStatus
    from app.services.platform.invite_service import compute_status

    now = datetime.now(timezone.utc)
    invite = PlatformInvite(
        email="x@example.com",
        token_hash=hash_token("t"),
        expires_at=now - timedelta(seconds=1),
        accepted_at=None,
        created_by=uuid.uuid4(),
    )
    assert compute_status(invite, now=now) == InviteStatus.EXPIRED


# ---------------------------------------------------------------------------
# Hash + escape primitives (no DB)
# ---------------------------------------------------------------------------


def test_hash_token_is_deterministic_and_64_hex_chars() -> None:
    """Same input → same hash; output is exactly 64 lowercase hex chars."""
    h1 = hash_token("hello")
    h2 = hash_token("hello")
    assert h1 == h2
    assert len(h1) == 64
    assert all(c in "0123456789abcdef" for c in h1)


def test_hash_token_distinguishes_inputs() -> None:
    assert hash_token("abc") != hash_token("abcd")


def test_invite_email_html_escapes_double_quote() -> None:
    """The accept-URL is embedded in an href="..." attribute. The escape
    must include quote=True so a hostile URL cannot break out.
    """
    from app.services.platform.invite_email import _build_invite_html

    hostile = 'https://example.com/x?evil="><script>x</script>'
    rendered = _build_invite_html(hostile)
    # The literal `"` inside the URL must have been escaped into &quot;
    # so the href attribute stays intact.
    assert '<script>' not in rendered
    assert '&quot;' in rendered
