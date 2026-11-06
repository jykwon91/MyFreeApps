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
