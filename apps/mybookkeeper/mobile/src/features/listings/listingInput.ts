import type { ListingFormValues } from "@mybookkeeper/api-client/types/listing/listing-form-values";
import { normalizeMoneyText } from "@mybookkeeper/api-client/utils/normalizeMoneyText";
import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";

const RATE_FIELDS = ["monthly_rate", "weekly_rate", "nightly_rate"] as const;

/**
 * The form as it's checked and sent: each rate in "1234.56" form however it was typed or pasted
 * ("$1,200" on a "." phone is 1200, "1200,50" on a "," phone is 1200.50). A rate that can't be
 * read for sure stays as typed, so listingFormProblems names it rather than a guess being saved.
 */
export function listingValuesToSend(values: ListingFormValues, decimalSeparator: DecimalSeparator): ListingFormValues {
  const sent = { ...values };
  for (const field of RATE_FIELDS) sent[field] = normalizeMoneyText(values[field], decimalSeparator) ?? values[field];
  return sent;
}

/** Whole days only. */
export function daysInput(text: string): string {
  return text.replace(/\D/g, "");
}
