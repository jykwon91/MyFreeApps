from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.services.system import health_service

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health probe — DB connectivity + deploy version.

    Returns the git commit short SHA so the deploy workflow can verify
    the running container matches the expected revision without parsing
    container logs. Mirrors apps/mybookkeeper/backend/app/main.py:/health.
    """
    # Lazy import to avoid a circular dep on app.main at module import time.
    from app.main import GIT_COMMIT

    if await health_service.check_database():
        return {"status": "ok", "database": "connected", "version": GIT_COMMIT}
    return JSONResponse(
        status_code=503,
        content={"status": "degraded", "database": "unreachable", "version": GIT_COMMIT},
    )
