import { MONEY_INPUT_MESSAGES } from "@mybookkeeper/api-client/constants/moneyInput";

/** Same wording as the server's 1099 reported amount check (app/core/transaction_amount_constants.py). */
export const REPORTED_AMOUNT_MESSAGES = {
  blank: "Enter the amount reported on the 1099.",
  negative: "Enter an amount of $0 or more.",
  notDollarsAndCents: MONEY_INPUT_MESSAGES.notDollarsAndCents,
  tooLarge: "That amount is too large.",
} as const;

/** Largest amount the reported amount column holds (Numeric(12, 2)). */
export const MAX_REPORTED_AMOUNT = 9_999_999_999.99;
