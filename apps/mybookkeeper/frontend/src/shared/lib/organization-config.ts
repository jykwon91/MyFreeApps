import { ASSIGNABLE_ROLE_OPTIONS } from "@mybookkeeper/api-client/constants/orgRoles";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";
import type { InviteStatus } from "@mybookkeeper/api-client/types/organization/InviteStatus";

export const INVITE_STATUS_COLORS: Record<InviteStatus, BadgeColor> = {
  pending: "yellow",
  accepted: "green",
  expired: "gray",
};

export const ROLE_BADGE_COLORS: Record<OrgRole, BadgeColor> = {
  owner: "blue",
  admin: "yellow",
  user: "gray",
  viewer: "gray",
};

export const ROLE_OPTIONS: { value: OrgRole; label: string; description: string }[] = [
  { value: "owner", label: "Owner", description: "Full access, can delete organization" },
  ...ASSIGNABLE_ROLE_OPTIONS,
];
