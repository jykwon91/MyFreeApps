import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";

export interface OrgWithRole {
  id: string;
  name: string;
  org_role: OrgRole;
  is_demo: boolean;
  created_at: string;
}
