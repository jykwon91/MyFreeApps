/**
 * Said the same on the website and the phone. The server replaces an older pending
 * invite only when the new one's email sends, so a mistyped one must be cancelled.
 */
export const INVITE_EMAIL_MESSAGES = {
  didntSend: "Email didn't send",
  failed: (email: string) => `I made the invite but couldn't send the email to ${email}. Check the address, or cancel it and try again.`,
} as const;
