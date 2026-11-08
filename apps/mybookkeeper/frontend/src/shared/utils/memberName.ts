import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";

export function memberName(member: Pick<OrgMember, "user_name" | "user_email">): string {
  return member.user_name || member.user_email || "Unnamed";
}
