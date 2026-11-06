/**
 * The account an earlier send went through, from a 409 refusing to settle it from
 * another one (`{"code": code, "sender_gmail_address": ...}`), or null for any other detail.
 */
export function sentFromOtherGmail(detail: unknown, code: string): string | null {
  if (typeof detail !== "object" || detail === null) return null;
  const { code: found, sender_gmail_address: address } = detail as { code?: unknown; sender_gmail_address?: unknown };
  return found === code && typeof address === "string" && address !== "" ? address : null;
}
