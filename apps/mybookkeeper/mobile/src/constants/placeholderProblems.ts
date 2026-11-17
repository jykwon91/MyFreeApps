import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";

/** What to say beside a placeholder field that can't be sent yet. The example uses the keypad's decimal mark. */
export const PLACEHOLDER_PROBLEM_MESSAGES = {
  required: "I need this one.",
  not_a_number: (decimalSeparator: DecimalSeparator) =>
    `That isn't a number I can read. Use digits, like 1500 or 1${decimalSeparator === "." ? "," : "."}500${decimalSeparator}50.`,
} as const;
