export type DeleteAccountResult =
  | { outcome: "deleted" }
  /** No clear answer came back, so the account may or may not be gone. */
  | { outcome: "unknown" }
  /** `message` is the server's, and says what's stopping it. */
  | { outcome: "refused"; message: string }
  | { outcome: "wrong_password" | "email_mismatch" | "code_required" | "invalid_code" | "rate_limited" | "failed" };
