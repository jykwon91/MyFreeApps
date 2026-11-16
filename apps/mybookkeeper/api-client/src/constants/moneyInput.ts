/** Whole dollars, or dollars and up to two cents digits — what an amount column stores without rounding. */
export const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Same wording as the server's transaction amount check (app/core/transaction_amount_constants.py). */
export const MONEY_INPUT_MESSAGES = {
  notPositive: "Enter an amount above $0.",
  notDollarsAndCents: "Use dollars and cents, like 84.20.",
} as const;
