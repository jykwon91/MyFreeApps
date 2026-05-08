/**
 * Maps backend 409 detail codes from POST /admin/invites into operator-
 * friendly hint messages. The admin route exposes specific codes (rather
 * than the single generic message used for non-admin callers) so the
 * operator can take the right action immediately.
 */

const INVITE_409_MESSAGES: Record<string, string> = {
  user_already_exists:
    "User already exists — nothing to invite. They can log in directly.",
  invite_already_pending:
    "Invite already pending — cancel it from the row above to resend.",
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

export function extractInviteCreateErrorMessage(err: unknown): string {
  const code = extractDetailCode(err);
  if (code !== undefined && code in INVITE_409_MESSAGES) {
    return INVITE_409_MESSAGES[code];
  }
  return "Couldn't send invite — please try again.";
}
