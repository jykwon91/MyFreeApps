import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";

export interface Workspace {
  id: string;
  name: string;
  org_role: OrgRole;
  is_demo: boolean;
}
