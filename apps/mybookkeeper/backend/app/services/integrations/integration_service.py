import logging
import uuid
from datetime import datetime, timedelta, timezone

from google_auth_oauthlib.flow import Flow
import jwt
from jwt.exceptions import PyJWTError as JWTError

from platform_shared.core.auth_events import AuthEventType

from app.core.config import settings
from app.core.context import RequestContext
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.responses.integration_info import IntegrationInfo
from app.models.responses.queue_item_info import QueueItemInfo
from app.models.responses.retry_result import RetryResult
from app.models.responses.sync_log_info import SyncLogInfo
from app.repositories import email_queue_repo, integration_repo, sync_log_repo
from app.services.system.auth_event_service import log_auth_event

logger = logging.getLogger(__name__)

GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"

# PR 2.3 expands the requested scope set to include ``gmail.send`` so the host
# can reply to inquiries directly from MyBookkeeper. Existing integrations
# created before PR 2.3 are missing the send scope — the inquiry reply flow
# detects that via the ``scopes`` metadata persisted at consent time and
# surfaces a reconnect banner. Read-only sync continues to work without the
# new scope, so existing users aren't disrupted until they want to reply.
GMAIL_SCOPES: list[str] = [GMAIL_READONLY_SCOPE, GMAIL_SEND_SCOPE]


def integration_has_send_scope(integration) -> bool:  # type: ignore[no-untyped-def]
    """Return True iff the integration's stored scopes include ``gmail.send``.

    Pre-PR-2.3 integrations have no ``scopes`` key in metadata — treated as
    "send not granted" so the host gets the reconnect prompt.
    """
    metadata = integration.metadata_ or {}
    granted = metadata.get("scopes") or []
    return GMAIL_SEND_SCOPE in granted


def _get_flow() -> Flow:
    return Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=GMAIL_SCOPES,
        redirect_uri=settings.oauth_redirect_uri,
    )


def _create_oauth_state(user_id: str, organization_id: str, code_verifier: str) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "org_id": organization_id,
            # PKCE verifier — Google requires this round-tripped at token-exchange
            # time so the new Flow instance in the callback can reuse the same
            # verifier the original Flow generated. Stuffing it into the state
            # JWT keeps the OAuth handshake stateless on the server side.
            "cv": code_verifier,
            "type": "oauth_state",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
        },
        settings.secret_key,
        algorithm="HS256",
    )


def _verify_oauth_state(state: str) -> tuple[str, str, str | None]:
    """Returns (user_id, organization_id, code_verifier) from state token.
    Raises ValueError on invalid/expired state. ``code_verifier`` may be None
    on legacy state tokens minted before the PKCE fix; the caller falls back
    to the Flow's own auto-generated verifier in that case (which Google
    rejects, but we surface a clean ValueError instead of a 500)."""
    try:
        payload: dict[str, str] = jwt.decode(state, settings.secret_key, algorithms=["HS256"])
        if payload.get("type") != "oauth_state":
            raise ValueError("Invalid OAuth state")
        return payload["sub"], payload["org_id"], payload.get("cv")
    except JWTError:
        raise ValueError("Invalid or expired OAuth state")


def get_gmail_connect_url(ctx: RequestContext) -> str:
    flow = _get_flow()
    # First call: have the Flow auto-generate ``code_verifier`` and
    # ``code_challenge``. The returned URL is discarded — we only need the
    # verifier on the Flow instance.
    flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent select_account",
    )
    # Persist the verifier in the JWT state so the callback can rebuild
    # the Flow with the same value (Google enforces PKCE verifier match).
    state = _create_oauth_state(
        str(ctx.user_id),
        str(ctx.organization_id),
        flow.code_verifier or "",
    )
    # Second call: reuse the same Flow (same verifier/challenge) and pass
    # our JWT state. Single ``state`` parameter, no manual URL splicing.
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        state=state,
        prompt="consent select_account",
    )
    return auth_url


async def handle_gmail_callback(code: str, state: str) -> None:
    """Exchange OAuth code for tokens, upsert integration. Raises ValueError on bad state."""
    user_id_str, org_id_str, code_verifier = _verify_oauth_state(state)
    if not code_verifier:
        raise ValueError("OAuth state missing PKCE verifier — restart the connection flow")

    flow = _get_flow()
    # Reuse the original code_verifier generated at auth-start. Without this,
    # the fresh Flow instance generates a new verifier and Google rejects with
    # "invalid_grant: Missing code verifier" (PR #221 RCA).
    flow.code_verifier = code_verifier
    try:
        flow.fetch_token(code=code)
    except Exception:
        logger.exception("Gmail OAuth token exchange failed (fetch_token)")
        raise
    creds = flow.credentials
    expiry = creds.expiry or datetime.now(timezone.utc) + timedelta(seconds=3600)

    # Google returns the actually-granted scopes (incremental consent may
    # mean fewer than what we requested). Persist them so we can detect
    # missing send-scope without a Google round-trip.
    granted_scopes = list(creds.scopes) if creds.scopes else []

    try:
        async with unit_of_work() as db:
            integration = await integration_repo.upsert_gmail(
                db,
                organization_id=uuid.UUID(org_id_str),
                user_id=uuid.UUID(user_id_str),
                access_token=creds.token,
                refresh_token=creds.refresh_token,
                token_expiry=expiry,
                scopes=granted_scopes,
            )
            # A successful re-auth clears any stale reauth state so the UI
            # reconnect banner goes away immediately after the OAuth popup closes.
            await integration_repo.clear_reauth_state(db, integration)
            await log_auth_event(
                db,
                event_type=AuthEventType.OAUTH_CONNECT,
                user_id=uuid.UUID(user_id_str),
                succeeded=True,
                metadata={"provider": "gmail"},
            )
    except Exception:
        logger.exception("Gmail OAuth upsert failed (upsert_gmail / clear_reauth_state)")
        raise


async def list_integrations(
    ctx: RequestContext,
) -> list[IntegrationInfo]:
    async with AsyncSessionLocal() as db:
        integrations = await integration_repo.list_by_org(db, ctx.organization_id)
        result: list[IntegrationInfo] = []
        for i in integrations:
            info: IntegrationInfo = {
                "provider": i.provider,
                "last_synced_at": i.last_synced_at,
                "connected": True,
            }
            if i.provider == "gmail":
                info["has_send_scope"] = integration_has_send_scope(i)
                info["needs_reauth"] = i.needs_reauth
                info["last_reauth_error"] = i.last_reauth_error
            result.append(info)
        return result


async def cancel_gmail_sync(ctx: RequestContext, sync_log_id: int | None = None) -> None:
    """Cancel a specific sync session or the latest running session."""
    async with unit_of_work() as db:
        if sync_log_id is not None:
            await sync_log_repo.cancel(db, sync_log_id)
        else:
            # Fallback: cancel the latest running sync for this org
            logs = await sync_log_repo.list_recent(db, ctx.organization_id, "gmail", limit=1)
            for log in logs:
                if log.status == "running":
                    await sync_log_repo.cancel(db, log.id)


async def check_sync_running(ctx: RequestContext) -> bool:
    async with AsyncSessionLocal() as db:
        running = await sync_log_repo.count_running(db, ctx.organization_id, "gmail")
        return bool(running)


async def start_extraction(ctx: RequestContext) -> int:
    async with AsyncSessionLocal() as db:
        count = await email_queue_repo.count_by_status(db, ctx.organization_id, "fetched")
        return count


async def get_queue_items(
    ctx: RequestContext,
) -> list[QueueItemInfo]:
    async with AsyncSessionLocal() as db:
        items = await email_queue_repo.list_recent(db, ctx.organization_id)
        return [
            QueueItemInfo(
                id=str(item.id),
                sync_log_id=item.sync_log_id,
                attachment_filename=item.attachment_filename,
                email_subject=item.email_subject,
                status=item.status,
                error=item.error,
                created_at=item.created_at.isoformat() if item.created_at else None,
            )
            for item in items
        ]


async def dismiss_queue_item(
    ctx: RequestContext, item_id: uuid.UUID,
) -> bool:
    async with unit_of_work() as db:
        item = await email_queue_repo.get_by_id(db, item_id)
        if not item or item.organization_id != ctx.organization_id:
            return False
        if item.status == "extracting":
            await email_queue_repo.mark_status(db, item, "failed", error="Dismissed by user")
        else:
            await email_queue_repo.delete_item(db, item)
        return True


async def retry_queue_item(
    ctx: RequestContext, item_id: uuid.UUID,
) -> RetryResult | None:
    """Returns None if not found. Raises ValueError if not failed."""
    async with unit_of_work() as db:
        item = await email_queue_repo.get_with_content(db, item_id, ctx.organization_id)
        if not item:
            return None
        if item.status != "failed":
            raise ValueError("Only failed items can be retried")

        new_status = await email_queue_repo.retry_item(db, item)
        return RetryResult(id=str(item.id), status=new_status)


async def retry_all_failed(ctx: RequestContext) -> None:
    async with unit_of_work() as db:
        await email_queue_repo.retry_all_failed(db, ctx.organization_id)


async def get_sync_logs(
    ctx: RequestContext,
) -> list[SyncLogInfo]:
    async with AsyncSessionLocal() as db:
        logs = await sync_log_repo.list_recent(db, ctx.organization_id, "gmail")
        all_counts = await email_queue_repo.get_status_counts_batch(
            db, [log.id for log in logs],
        )
        response: list[SyncLogInfo] = []
        for log in logs:
            queue_counts = all_counts.get(log.id, {})
            emails_total: int = log.total_items if log.total_items > 0 else sum(queue_counts.values())
            emails_done: int = queue_counts.get("done", 0) + queue_counts.get("failed", 0)
            emails_fetched: int = (
                queue_counts.get("fetched", 0)
                + queue_counts.get("extracting", 0)
                + queue_counts.get("done", 0)
            )
            response.append(SyncLogInfo(
                id=log.id,
                status=log.status,
                records_added=log.records_added,
                error=log.error,
                started_at=log.started_at,
                completed_at=log.completed_at,
                cancelled_at=log.cancelled_at,
                total_items=log.total_items,
                emails_total=emails_total,
                emails_done=emails_done,
                emails_fetched=emails_fetched,
            ))
        return response


async def diagnostic_gmail_search(
    ctx: RequestContext,
    *,
    query: str | None = None,
    limit: int = 25,
) -> dict:
    """Run a Gmail search bypassing the dedup set; return raw match metadata.

    Returns
        {
          "query": <effective query>,
          "count": <int>,
          "results": [{"id": str, "subject": str, "from": str, "date": str}, ...],
          "error": <str | None>,
        }

    Used to diagnose why an expected email isn't being picked up by sync.
    """
    from app.services.email import gmail_service
    from app.repositories import integration_repo

    effective_query = query if query is not None else settings.gmail_search_query

    async with AsyncSessionLocal() as db:
        integration = await integration_repo.get_by_org_and_provider(
            db, ctx.organization_id, "gmail",
        )
    if not integration or not integration.access_token:
        return {
            "query": effective_query,
            "count": 0,
            "results": [],
            "error": "Gmail not connected",
        }

    try:
        service = gmail_service.get_gmail_service(
            integration.access_token, integration.refresh_token,
        )
        results = service.users().messages().list(
            userId="me", q=effective_query, maxResults=limit,
        ).execute()
        messages = results.get("messages", [])
        out: list[dict] = []
        for msg in messages:
            try:
                preview = service.users().messages().get(
                    userId="me", id=msg["id"], format="metadata",
                    metadataHeaders=["Subject", "From", "Date"],
                ).execute()
                headers = {
                    h["name"]: h["value"]
                    for h in preview.get("payload", {}).get("headers", [])
                }
                out.append({
                    "id": msg["id"],
                    "subject": headers.get("Subject", ""),
                    "from": headers.get("From", ""),
                    "date": headers.get("Date", ""),
                })
            except Exception:
                out.append({
                    "id": msg["id"],
                    "subject": "<metadata fetch failed>",
                    "from": "",
                    "date": "",
                })
        return {
            "query": effective_query,
            "count": len(messages),
            "results": out,
            "error": None,
        }
    except Exception as e:
        logger.exception("diagnostic_gmail_search failed")
        return {
            "query": effective_query,
            "count": 0,
            "results": [],
            "error": str(e),
        }


async def disconnect_gmail(ctx: RequestContext) -> bool:
    async with unit_of_work() as db:
        integration = await integration_repo.get_by_org_and_provider(db, ctx.organization_id, "gmail")
        if not integration:
            return False
        await integration_repo.delete(db, integration)
        await log_auth_event(
            db,
            event_type=AuthEventType.OAUTH_DISCONNECT,
            user_id=ctx.user_id,
            succeeded=True,
            metadata={"provider": "gmail"},
        )
        return True
