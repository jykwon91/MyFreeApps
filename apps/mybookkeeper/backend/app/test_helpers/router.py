"""Unified test-helpers router.

Aggregates the sub-routers (auth, seed, document_seed, extraction_seed, gmail_seed, rent_seed, tax_seed, mocks) into a single router
suitable for conditional mounting in ``app/main.py``.
"""

from fastapi import APIRouter

from app.test_helpers import auth, document_seed, extraction_seed, gmail_seed, member_seed, mocks, rent_seed, seed, tax_seed

router = APIRouter(tags=["test"])

router.include_router(auth.router)
router.include_router(seed.router)
router.include_router(document_seed.router)
router.include_router(extraction_seed.router)
router.include_router(member_seed.router)
router.include_router(gmail_seed.router)
router.include_router(rent_seed.router)
router.include_router(tax_seed.router)
router.include_router(mocks.router)
