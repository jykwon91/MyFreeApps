import type { AssignableRole } from "@mybookkeeper/api-client/types/organization/AssignableRole";
import type { OrgInvite } from "@mybookkeeper/api-client/types/organization/OrgInvite";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";

export interface InviteRequest {
  email: string;
  role: AssignableRole;
  members: readonly OrgMember[];
  invites: readonly OrgInvite[];
  /** An address being invited again on purpose, which replaces its pending invite. */
  resendingTo: string | null;
  now: Date;
}
