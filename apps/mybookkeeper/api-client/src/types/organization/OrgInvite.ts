import type { InviteStatus } from "./InviteStatus";
import type { OrgRole } from "./OrgRole";

export interface OrgInvite {
  id: string;
  organization_id: string;
  email: string;
  org_role: OrgRole;
  status: InviteStatus;
  email_sent: boolean;
  created_at: string;
  expires_at: string;
}
