import type { OrgRole } from "./OrgRole";

export type AssignableRole = Exclude<OrgRole, "owner">;
