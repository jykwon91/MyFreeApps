import type { OrgInvite } from "../types/organization/OrgInvite";

/** The server keeps an expired invite as "pending" and refuses it at accept time. */
export function isInviteExpired(invite: Pick<OrgInvite, "expires_at">, now: Date): boolean {
  return new Date(invite.expires_at).getTime() <= now.getTime();
}
