import { Badge } from "@platform/ui";
import { INVITE_STATUS, type InviteStatus } from "@/types/invite/invite-status";

const STATUS_LABELS: Record<InviteStatus, string> = {
  [INVITE_STATUS.PENDING]: "Pending",
  [INVITE_STATUS.ACCEPTED]: "Accepted",
  [INVITE_STATUS.EXPIRED]: "Expired",
};

const STATUS_COLORS: Record<InviteStatus, "blue" | "green" | "gray"> = {
  [INVITE_STATUS.PENDING]: "blue",
  [INVITE_STATUS.ACCEPTED]: "green",
  [INVITE_STATUS.EXPIRED]: "gray",
};

export interface InviteStatusBadgeProps {
  status: InviteStatus;
}

/**
 * Coloured pill that mirrors the backend's three-state invite enum.
 * Lives in its own file so the InvitesList row can stay shape-only.
 */
export default function InviteStatusBadge({ status }: InviteStatusBadgeProps) {
  return <Badge label={STATUS_LABELS[status]} color={STATUS_COLORS[status]} />;
}
