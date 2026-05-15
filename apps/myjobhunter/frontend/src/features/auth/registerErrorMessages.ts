/**
 * Maps fastapi-users ``POST /auth/register`` error bodies into clear,
 * user-facing copy.
 *
 * fastapi-users returns two failure shapes on the register route:
 *   - ``{detail: "REGISTER_USER_ALREADY_EXISTS"}`` — a bare string code
 *   - ``{detail: {code: "REGISTER_INVALID_PASSWORD", reason: "..."}}`` —
 *     a nested object whose ``reason`` is already human-readable
 *
 * Without this mapping the raw code (or, worse, axios's
 * ``"Request failed with status code 400"``) is what the user sees.
 * Mirrors the ``features/admin/invites/inviteErrorMessages.ts`` pattern.
 */
import { extractErrorMessage } from "@platform/ui";

const REGISTER_CODE_MESSAGES: Record<string, string> = {
  REGISTER_USER_ALREADY_EXISTS:
    "An account with this email already exists. Sign in instead.",
};

function rawDetail(err: unknown): unknown {
  if (err === null || typeof err !== "object") return undefined;
  const obj = err as Record<string, unknown>;
  // axios: body at err.response.data.detail
  const response = obj.response;
  if (response !== null && typeof response === "object") {
    const data = (response as Record<string, unknown>).data;
    if (data !== null && typeof data === "object") {
      return (data as Record<string, unknown>).detail;
    }
  }
  // RTK Query: body at err.data.detail
  const data = obj.data;
  if (data !== null && typeof data === "object") {
    return (data as Record<string, unknown>).detail;
  }
  return undefined;
}

export function describeRegisterError(err: unknown): string {
  const detail = rawDetail(err);

  if (typeof detail === "string" && detail in REGISTER_CODE_MESSAGES) {
    return REGISTER_CODE_MESSAGES[detail];
  }

  // Invalid-password failures carry an already-readable reason string
  // (e.g. the HIBP breach message or the length rule).
  if (
    detail !== null &&
    typeof detail === "object" &&
    typeof (detail as Record<string, unknown>).reason === "string"
  ) {
    return (detail as { reason: string }).reason;
  }

  return extractErrorMessage(err);
}
