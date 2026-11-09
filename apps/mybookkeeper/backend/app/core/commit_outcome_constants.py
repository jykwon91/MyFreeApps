"""Constants for confirming whether an interrupted COMMIT landed."""
from __future__ import annotations

# How long the outcome check waits for the original transaction's row lock. If
# the transaction is still in flight past this, the outcome stays unknown and
# the uploaded objects are kept.
OUTCOME_CHECK_LOCK_TIMEOUT_MS = 2_000
