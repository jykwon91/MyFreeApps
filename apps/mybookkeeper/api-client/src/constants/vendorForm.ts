import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";

// Bounds mirror the String() lengths on the backend Vendor model.
export const VENDOR_NAME_MAX_LENGTH = 255;
export const VENDOR_PHONE_MAX_LENGTH = 50;
export const VENDOR_EMAIL_MAX_LENGTH = 255;
export const VENDOR_ADDRESS_MAX_LENGTH = 500;

/** Whole dollars the server's Numeric(12, 2) hourly_rate column holds. */
export const VENDOR_HOURLY_RATE_MAX_WHOLE_DIGITS = 10;
/** A minus sign typed ahead of the rate, so a negative gets its own message. */
export const VENDOR_HOURLY_RATE_NEGATIVE_PATTERN = /^\s*-/;
export const VENDOR_EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export const VENDOR_FORM_PROBLEMS = {
  nameRequired: "Add a name.",
  emailInvalid: "That doesn't look like an email address.",
  rateNegative: "The rate can't be below $0.",
  rateInvalid: (decimalSeparator: DecimalSeparator) => `Enter the rate as dollars, like 95 or 95${decimalSeparator}50.`,
} as const;
