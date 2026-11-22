import type { AdvanceOrderResponse } from "@/types/service/service";

/** What to tell the operator when the order-ready text didn't go out cleanly. */
export function readyTextFailureMessage(
  result: Pick<AdvanceOrderResponse, "sms_error" | "sms_outcome_unknown">,
  phone: string,
): string {
  if (result.sms_outcome_unknown) {
    return `Twilio didn't confirm the ready text, so it may already have been sent. Check the Twilio message log before texting ${phone} yourself.`;
  }
  return `SMS not sent (${result.sms_error || "unknown error"}). Please text ${phone} manually.`;
}
