import asyncio
import logging
import os
import subprocess
import time
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import jwt
from jwt.exceptions import PyJWTError as JWTError
from sqlalchemy import text

from platform_shared.core.lifespan import create_app_lifespan

from app.core.auth import fastapi_users, auth_backend
from app.core.config import settings
from app.core.observability import init_sentry


def _resolve_git_commit() -> str:
    env_commit = os.environ.get("GIT_COMMIT", "").strip()
    if env_commit:
        return env_commit
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return "unknown"


GIT_COMMIT = _resolve_git_commit()
STARTUP_TIMESTAMP = datetime.now(timezone.utc).isoformat()

from app.core.audit import current_user_id
from app.core.rate_limit import check_account_not_locked, check_login_rate_limit, check_password_reset_rate_limit, check_register_rate_limit, require_turnstile
from app.db.session import AsyncSessionLocal
from app.schemas.user.user import UserRead, UserCreate, UserUpdate
from app.services.storage.bucket_initializer import ensure_bucket
from app.workers.upload_processor_worker import main as worker_main
from app.api import account, activities, analytics, applicants, attribution, blackouts, booking_statements, calendar, classification_rules, costs, db_admin, demo, documents, frontend_errors, inquiries, insurance_policies, lease_templates, listings, properties, public_inquiries, rent_receipts, reply_templates, signed_leases, tenants, summary, integrations, audit, prompts, admin, organizations, transactions, reconciliation, screening, tax_completeness, tax_documents, tax_profile, tax_returns, tax_year_profiles, plaid, vendors, webhooks, exports, imports, health_dashboard, totp, taxpayer_profiles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("app")


_worker_task: asyncio.Task[None] | None = None


async def _on_startup() -> None:
    """MBK-specific startup: spawn the Dramatiq upload-processor worker.

    The worker pulls Document rows in status=processing and runs the
    extraction pipeline; if RUN_UPLOAD_WORKER is False (e.g. running
    a one-off migration container), we skip it so the same image can
    boot without grabbing the queue.
    """
    global _worker_task
    if settings.run_upload_worker:
        async def _run_worker() -> None:
            try:
                await worker_main()
            except asyncio.CancelledError:
                pass

        _worker_task = asyncio.create_task(_run_worker())


async def _on_shutdown() -> None:
    """MBK-specific shutdown: cancel the upload worker."""
    global _worker_task
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass


lifespan = create_app_lifespan(
    settings=settings,
    init_sentry=init_sentry,
    bucket_init=ensure_bucket,
    on_startup=_on_startup,
    on_shutdown=_on_shutdown,
)


app = FastAPI(title="MyBookkeeper API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^chrome-extension://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def set_audit_user(request: Request, call_next):
    start = time.perf_counter()
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    user_id = None
    if token:
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
            user_id = payload.get("sub")
            token_ctx = current_user_id.set(user_id)
            try:
                response = await call_next(request)
            finally:
                current_user_id.reset(token_ctx)
        except JWTError:
            response = await call_next(request)
    else:
        response = await call_next(request)

    ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s %s %.0fms user=%s",
        request.method, request.url.path, response.status_code, ms, user_id or "anonymous",
    )
    if response.status_code >= 500:
        logger.error("5xx on %s %s", request.method, request.url.path)
    return response


# Auth routes (rate-limited)
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/auth/jwt",
    tags=["auth"],
    dependencies=[Depends(check_login_rate_limit), Depends(check_account_not_locked)],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["auth"],
    dependencies=[Depends(check_register_rate_limit)],
)
_reset_router = fastapi_users.get_reset_password_router()
for _route in _reset_router.routes:
    if getattr(_route, "path", None) == "/forgot-password":
        _route.dependencies.append(Depends(require_turnstile))
app.include_router(
    _reset_router,
    prefix="/auth",
    tags=["auth"],
    dependencies=[Depends(check_password_reset_rate_limit)],
)
app.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix="/auth",
    tags=["auth"],
)
# Register account self-service routes BEFORE the fastapi-users users router so that
# DELETE /users/me is matched here rather than by fastapi-users' DELETE /users/{id}.
app.include_router(account.router)
app.include_router(fastapi_users.get_users_router(UserRead, UserUpdate), prefix="/users", tags=["users"])

# App routes
app.include_router(documents.router)
app.include_router(properties.router)
app.include_router(listings.router)
app.include_router(listings.channels_router)
app.include_router(listings.channel_listings_router)
app.include_router(blackouts.router)
# Public iCal feed — unauthenticated, follows a stable channel-facing
# path (``/calendar/{token}.ics``). Mounted separately from the
# authenticated calendar viewer below so the two have independent
# dependency stacks.
app.include_router(calendar.router)
# Authenticated unified calendar viewer — declared separately because it
# has different auth/rate-limit needs from the public iCal feed above.
app.include_router(calendar.events_router)
# Phase 2 — Gmail booking review queue.
app.include_router(calendar.review_queue_router)
app.include_router(inquiries.router)
# Public inquiry form (T0) — unauthenticated. The router declares no prefix
# because production Caddy (``uri strip_prefix /api``) and the Vite dev proxy
# already drop the ``/api`` segment before requests reach FastAPI. See the
# detailed comment in ``api/public_inquiries.py``.
app.include_router(public_inquiries.router)
app.include_router(applicants.router)
app.include_router(lease_templates.router)
app.include_router(signed_leases.router)
app.include_router(insurance_policies.router)
app.include_router(screening.router)
app.include_router(vendors.router)
app.include_router(reply_templates.router)
app.include_router(tenants.router)
app.include_router(rent_receipts.router)
app.include_router(summary.router)
app.include_router(integrations.router)
app.include_router(audit.router)
# Shared platform admin router — generic user-management endpoints
# (list/role/activate/deactivate/superuser/stats-users). Mounted before
# the MBK-specific admin router so both sets of routes live under
# /admin without path collisions.
from platform_shared.api.admin_router import build_admin_router
from platform_shared.services.totp_service import (
    verify_code as _verify_code,
    verify_recovery_code as _verify_recovery_code,
)
from app.core.permissions import current_admin
from app.services.system.admin_user_service_factory import shared_admin_user_service
from app.services.user.totp_service import _decrypt as _decrypt_totp_secret


# Step-up verifier for the shared toggle_superuser endpoint. Operators
# without TOTP enrollment cannot perform the highest-privilege op —
# forces the right shape: any user with ``is_superuser=True`` must
# also have TOTP set up. Mirrors the MJH wiring in apps/myjobhunter
# /backend/app/main.py::_superuser_step_up.
async def _superuser_step_up(admin, totp_code: str) -> bool:
    if not getattr(admin, "totp_enabled", False) or not admin.totp_secret:
        return False
    if not totp_code:
        return False
    try:
        secret = _decrypt_totp_secret(admin.totp_secret, admin.id)
    except Exception:
        return False
    algorithm = getattr(admin, "totp_algorithm", "sha1")
    if _verify_code(secret, totp_code, algorithm=algorithm):
        return True
    if admin.totp_recovery_codes:
        try:
            recovery_str = _decrypt_totp_secret(admin.totp_recovery_codes, admin.id)
        except Exception:
            return False
        valid, _ = _verify_recovery_code(recovery_str, totp_code)
        if valid:
            return True
    return False


app.include_router(
    build_admin_router(
        service=shared_admin_user_service,
        current_admin=current_admin,
        step_up_verify=_superuser_step_up,
    )
)
app.include_router(admin.router)
app.include_router(db_admin.router)
app.include_router(prompts.router)
app.include_router(organizations.router)
app.include_router(attribution.router)
app.include_router(transactions.router)
app.include_router(booking_statements.router)
app.include_router(reconciliation.router)
app.include_router(tax_profile.router)
app.include_router(tax_returns.router)
app.include_router(tax_documents.router)
app.include_router(tax_completeness.router)
app.include_router(tax_year_profiles.router)
app.include_router(activities.router)
app.include_router(plaid.router)
app.include_router(webhooks.router)
app.include_router(exports.router)
app.include_router(imports.router)
app.include_router(classification_rules.router)
app.include_router(costs.router)
app.include_router(health_dashboard.router)
app.include_router(frontend_errors.router)
app.include_router(totp.router)
app.include_router(taxpayer_profiles.router)
app.include_router(demo.router)
app.include_router(analytics.router)
if settings.allow_test_admin_promotion:
    from app.api import test_utils
    app.include_router(test_utils.router)


@app.get("/health")
async def health():
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected", "version": GIT_COMMIT}
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "unreachable", "version": GIT_COMMIT},
        )


@app.get("/api/version")
async def version():
    return {"commit": GIT_COMMIT, "timestamp": STARTUP_TIMESTAMP}
