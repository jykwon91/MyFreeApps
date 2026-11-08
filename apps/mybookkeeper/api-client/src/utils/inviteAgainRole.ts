import type { AssignableRole } from "../types/organization/AssignableRole";
import type { OrgInvite } from "../types/organization/OrgInvite";

/** Nobody can be invited as an owner, so an old owner invite goes out again as a user. */
export function inviteAgainRole(invite: Pick<OrgInvite, "org_role">): AssignableRole {
  return invite.org_role === "owner" ? "user" : invite.org_role;
}
