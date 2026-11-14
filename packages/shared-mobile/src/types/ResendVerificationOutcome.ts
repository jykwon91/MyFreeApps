/** `sent` means the server accepted the request, whether or not the address is registered. */
export type ResendVerificationOutcome = "sent" | "rate_limited" | "failed";
