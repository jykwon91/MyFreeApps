/** Mirrors NON_DEDUCTIBLE_TAGS in backend/app/core/tags.py. Listed on a tax report, but not in its deductions. */
export const NON_DEDUCTIBLE_CATEGORIES: readonly string[] = ["mortgage_principal"];

/** Mirrors NEUTRAL_TAGS in backend/app/core/tags.py. Listed on a tax report, but neither income nor a deduction. */
export const NEUTRAL_CATEGORIES: readonly string[] = ["security_deposit"];
