import { TAX_FIELD_LIMITS } from "./taxFieldLimits";

export const TAX_FIELD_OVERRIDE_PROBLEMS = {
  number: `Enter a number, like 1250.50, with at most ${TAX_FIELD_LIMITS.numericMaxDecimals} decimals and ${TAX_FIELD_LIMITS.numericMaxDigits - TAX_FIELD_LIMITS.numericMaxDecimals} digits before them.`,
  tooLong: `Use ${TAX_FIELD_LIMITS.textMaxLength} characters or fewer.`,
  blank: "Enter a value, or clear it.",
  masked: "That value is hidden. Type the full value, or clear it.",
  reason: "Say why you're changing it.",
} as const;
