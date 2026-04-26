import type { OrgRole } from "./org-role";

export type InviteStatus = "pending" | "accepted" | "expired";

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

export interface InviteInfo {
  org_name: string;
  org_role: string;
  inviter_name: string;
  email: string;
  expires_at: string;
  is_expired: boolean;
  user_exists: boolean;
}
