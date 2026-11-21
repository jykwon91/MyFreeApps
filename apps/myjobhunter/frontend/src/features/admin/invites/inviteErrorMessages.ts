/**
 * Maps backend 409 and 502 detail codes from POST /admin/invites into operator-
 * friendly hint messages. The admin route exposes specific codes (rather
 * than the single generic message used for non-admin callers) so the
 * operator can take the right action immediately.
 */

const INVITE_EMAIL_UNCONFIRMED = "invite_email_unconfirmed";

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  user_already_exists:
    "User already exists — nothing to invite. They can log in directly.",
  invite_already_pending:
    "Invite already pending — cancel it from the row above to resend.",
  [INVITE_EMAIL_UNCONFIRMED]:
    "The email may have arrived, but we couldn't confirm it. The invite is in the list — cancel it and send again if the recipient says nothing came.",
  invite_email_failed:
    "The invite email couldn't be sent, so no invite was created. Try again in a few minutes.",
};

function extractDetailCode(err: unknown): string | undefined {
  if (
    err != null &&
    typeof err === "object" &&
    "data" in err &&
    err.data != null &&
    typeof err.data === "object" &&
    "detail" in err.data &&
    typeof (err.data as { detail: unknown }).detail === "string"
  ) {
    return (err.data as { detail: string }).detail;
  }
  return undefined;
}

/** True when the invite was kept because its email may have been delivered. */
export function isInviteEmailUnconfirmed(err: unknown): boolean {
  return extractDetailCode(err) === INVITE_EMAIL_UNCONFIRMED;
}

export function extractInviteCreateErrorMessage(err: unknown): string {
  const code = extractDetailCode(err);
  if (code !== undefined && code in INVITE_ERROR_MESSAGES) {
    return INVITE_ERROR_MESSAGES[code];
  }
  return "Couldn't send invite — please try again.";
}
