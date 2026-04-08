import type { OrgRole } from "./org-role";

export interface OrgWithRole {
  id: string;
  name: string;
  org_role: OrgRole;
  is_demo: boolean;
  created_at: string;
}
