import type { OrgRole } from "./org-role";

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  org_role: OrgRole;
  joined_at: string;
  user_email: string | null;
  user_name: string | null;
}
