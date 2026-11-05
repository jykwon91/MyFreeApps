import type { AssignableRole } from "../types/organization/AssignableRole";
import type { OrgRole } from "../types/organization/OrgRole";

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  user: "User",
  viewer: "Viewer",
};

export const ASSIGNABLE_ROLE_OPTIONS: readonly { value: AssignableRole; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Manage members, edit all data" },
  { value: "user", label: "User", description: "Add and edit most data" },
  { value: "viewer", label: "Viewer", description: "Read-only. Can't create or edit." },
];

export const INVITE_ROLE_OPTIONS: readonly { value: AssignableRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
  { value: "viewer", label: "Viewer" },
];
