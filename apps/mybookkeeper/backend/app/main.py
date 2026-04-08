import asyncio
import logging
import os
import subprocess
import time
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

import sentry_sdk
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import jwt, JWTError
from sqlalchemy import text

from app.core.auth import fastapi_users, auth_backend
from app.core.config import settings


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

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        send_default_pii=False,
        traces_sample_rate=0.1,
        environment="production",
    )
from app.core.audit import current_user_id, register_audit_listeners
from app.core.rate_limit import check_login_rate_limit, check_password_reset_rate_limit, check_register_rate_limit
from app.db.session import AsyncSessionLocal
from app.schemas.user.user import UserRead, UserCreate, UserUpdate
from app.workers.upload_processor_worker import main as worker_main
from app.api import activities, analytics, classification_rules, costs, db_admin, demo, documents, frontend_errors, properties, tenants, summary, integrations, audit, prompts, admin, organizations, transactions, reservations, reconciliation, tax_completeness, tax_documents, tax_profile, tax_returns, tax_year_profiles, plaid, webhooks, exports, imports, health_dashboard, totp, taxpayer_profiles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    register_audit_listeners()
    worker_task: asyncio.Task[None] | None = None
    if settings.run_upload_worker:
        async def _run_worker() -> None:
            try:
                await worker_main()
            except asyncio.CancelledError:
                pass

        worker_task = asyncio.create_task(_run_worker())

    yield

    if worker_task and not worker_task.done():
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass


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
    dependencies=[Depends(check_login_rate_limit)],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["auth"],
    dependencies=[Depends(check_register_rate_limit)],
)
app.include_router(
    fastapi_users.get_reset_password_router(),
    prefix="/auth",
    tags=["auth"],
    dependencies=[Depends(check_password_reset_rate_limit)],
)
app.include_router(fastapi_users.get_users_router(UserRead, UserUpdate), prefix="/users", tags=["users"])

# App routes
app.include_router(documents.router)
app.include_router(properties.router)
app.include_router(tenants.router)
app.include_router(summary.router)
app.include_router(integrations.router)
app.include_router(audit.router)
app.include_router(admin.router)
app.include_router(db_admin.router)
app.include_router(prompts.router)
app.include_router(organizations.router)
app.include_router(transactions.router)
app.include_router(reservations.router)
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
