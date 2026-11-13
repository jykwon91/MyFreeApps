/** Matches the web sign-in page's resend button. */
export const RESEND_VERIFICATION_COPY = {
  label: "Resend verification email",
  loading: "Sending...",
  sent: "Verification email sent. Check your inbox.",
  rateLimited: "Too many requests. Wait a few minutes, then try again.",
  failed: "Couldn't resend right now. Try again shortly.",
} as const;
