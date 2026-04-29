"""Screening provider integration.

PR 3.3 (rentals Phase 3, KeyCheck redirect-only) ships a single provider —
KeyCheck — but the data model (``screening_results.provider`` is a check
constraint not a SAEnum) and this service interface stay generic enough to
add another provider later without a schema change. See RENTALS_PLAN.md
§5.3 / §8.5 for the design rationale.
"""
from app.services.screening.screening_service import (
    ScreeningProvider,
    ScreeningServiceError,
    ScreeningUploadValidationError,
    StorageNotConfiguredError,
    UnknownProviderError,
    get_provider,
    initiate_redirect,
    list_results,
    record_result,
)

__all__ = [
    "ScreeningProvider",
    "ScreeningServiceError",
    "ScreeningUploadValidationError",
    "StorageNotConfiguredError",
    "UnknownProviderError",
    "get_provider",
    "initiate_redirect",
    "list_results",
    "record_result",
]
