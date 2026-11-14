import type { OrgRole } from "./OrgRole";

/** An organization as the signed-in person sees it in their list: with their role in it. */
export interface OrgWithRole {
  id: string;
  name: string;
  org_role: OrgRole;
  is_demo: boolean;
  created_at: string;
}
