/**
 * Mirrors ``backend/app/core/savings_enums.py``: a value added there MUST be
 * added here in the same PR.
 */
export const SAVINGS_CATEGORIES = [
  "credit_card",
  "bank_bonus",
  "subscription",
  "phone_internet",
  "insurance",
  "mortgage",
  "utilities",
  "property_tax",
  "other",
] as const;

export const SAVINGS_EFFORTS = ["low", "medium", "high"] as const;

export const SAVINGS_IDEA_STATUSES = ["open", "done", "dismissed"] as const;

export const SAVINGS_RUN_STATUSES = ["running", "succeeded", "failed"] as const;

/** How often the page re-reads while a research run is going. */
export const SAVINGS_POLL_MS = 5_000;
