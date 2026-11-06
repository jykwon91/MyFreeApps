import type { OrgMember } from "../types/organization/OrgMember";
import type { OrgRole } from "../types/organization/OrgRole";

/**
 * Nobody changes the owner or themselves. Admins manage users and viewers;
 * only the owner can demote or remove an admin. The server enforces the same rule.
 */
export function canManageMember(member: Pick<OrgMember, "org_role">, myRole: OrgRole | null, isMe: boolean): boolean {
  if (isMe || member.org_role === "owner") return false;
  if (myRole === "owner") return true;
  return myRole === "admin" && member.org_role !== "admin";
}
