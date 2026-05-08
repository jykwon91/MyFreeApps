"""Unified test-helpers router.

Aggregates the three sub-routers (auth, seed, mocks) into a single router
suitable for conditional mounting in ``app/main.py``.
"""

from fastapi import APIRouter

from app.test_helpers import auth, mocks, seed

router = APIRouter(tags=["test"])

router.include_router(auth.router)
router.include_router(seed.router)
router.include_router(mocks.router)
