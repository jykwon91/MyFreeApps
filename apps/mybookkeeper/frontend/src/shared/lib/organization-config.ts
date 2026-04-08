import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { OrgRole } from "@/shared/types/organization/org-role";
import type { InviteStatus } from "@/shared/types/organization/invite";

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  user: "User",
  viewer: "Viewer",
};

export const INVITE_STATUS_COLORS: Record<InviteStatus, BadgeColor> = {
  pending: "yellow",
  accepted: "green",
  expired: "gray",
};

export const INVITE_ROLE_OPTIONS: { value: OrgRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
  { value: "viewer", label: "Viewer" },
];

export const ROLE_BADGE_COLORS: Record<OrgRole, BadgeColor> = {
  owner: "blue",
  admin: "yellow",
  user: "gray",
  viewer: "gray",
};

export const ROLE_OPTIONS: { value: OrgRole; label: string; description: string }[] = [
  { value: "owner", label: "Owner", description: "Full access, can delete organization" },
  { value: "admin", label: "Admin", description: "Manage members, edit all data" },
  { value: "user", label: "User", description: "Upload documents, view data" },
  { value: "viewer", label: "Viewer", description: "Read-only access, cannot create or edit" },
];
