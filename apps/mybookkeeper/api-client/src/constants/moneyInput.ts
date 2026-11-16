import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";

/** Any run of spaces, including the no-break ones some locales group thousands with ("1 200,50"). */
export const MONEY_SPACES = /\s+/g;

/** A dollar sign typed or pasted ahead of the amount, and the spaces after it. */
export const MONEY_CURRENCY_PREFIX = /^\$\s*/;

/** Everything an amount can be written with once the dollar sign is gone: digits, both marks and spaces. */
export const MONEY_CHARACTERS = /^[\d., ]+$/;

/** Cents: one or two digits after the decimal mark. */
export const MONEY_CENTS = /^\d{1,2}$/;

/** What follows a thousands mark. */
export const MONEY_THOUSANDS_GROUP = /^\d{3}$/;

/** What leads a grouped amount: 1 to 999, so "0,500" is never read as five hundred. */
export const MONEY_LEADING_GROUP = /^[1-9]\d{0,2}$/;

/** Same wording as the server's transaction amount check (app/core/transaction_amount_constants.py), which shows the "." form. */
export const MONEY_INPUT_MESSAGES = {
  notPositive: "Enter an amount above $0.",
  notDollarsAndCents: (decimalSeparator: DecimalSeparator) => `Use dollars and cents, like 84${decimalSeparator}20.`,
} as const;
