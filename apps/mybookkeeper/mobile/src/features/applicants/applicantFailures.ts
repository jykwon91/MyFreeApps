import { httpStatus } from "../transactions/transactionMessages";

/** The server's own wording can be a developer string, so it's never shown. */
function commonFailure(status: number | undefined): string | null {
  if (status === 403) return "You have view-only access.";
  return status === 404 ? "I can't find that applicant anymore." : null;
}

/** Null when the move landed and only the answer was lost: no reply, or a gateway failing on the way back. */
export function stageMoveFailure(error: unknown, alreadyThere: string | null): string | null {
  const status = httpStatus(error);
  if (alreadyThere && (status === undefined || status >= 500)) return null;
  if (alreadyThere && status === 422) return `They're already at ${alreadyThere}.`;
  if (status === 422) return "That move isn't available anymore. Their stage may have changed on the website.";
  return commonFailure(status) ?? "I couldn't move them. Want to try again?";
}

export function contractStartFailure(error: unknown): string {
  const status = httpStatus(error);
  if (status === 409) return "The lease is signed, so this date is locked.";
  return commonFailure(status) ?? "I couldn't save that date. Want to try again?";
}
