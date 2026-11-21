"""Retry budget for refinement-session preparation after a temporary Claude failure."""
from __future__ import annotations

REFINEMENT_PREP_MAX_RETRIES = 5
REFINEMENT_PREP_RETRY_BASE_SECONDS = 60
