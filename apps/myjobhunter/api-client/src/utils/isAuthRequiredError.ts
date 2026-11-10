import { JD_AUTH_REQUIRED_DETAIL } from "../constants/addApplicationForm";

/**
 * True for POST /applications/extract-from-url's 422 `{detail: "auth_required"}`: the link is
 * behind a sign-in or came back nearly empty, so the person should paste the text instead.
 */
export function isAuthRequiredError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { status, data } = err as { status?: unknown; data?: unknown };
  if (status !== 422 || typeof data !== "object" || data === null) return false;
  return (data as { detail?: unknown }).detail === JD_AUTH_REQUIRED_DETAIL;
}
