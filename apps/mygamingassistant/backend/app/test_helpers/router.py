"""MGA test-helpers router — aggregates seed + reset sub-routers.

Only mounted when ``settings.mga_enable_test_helpers`` is True.
Never mount in production.
"""
from fastapi import APIRouter

from app.test_helpers import reset, seed

router = APIRouter(prefix="/_test", tags=["test"])
router.include_router(reset.router)
router.include_router(seed.router)
