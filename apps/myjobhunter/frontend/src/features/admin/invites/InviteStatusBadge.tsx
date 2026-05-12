import { StatusBadge } from "@platform/ui";
import type { BadgeTone } from "@platform/ui";
import { INVITE_STATUS, type InviteStatus } from "@/types/invite/invite-status";

const STATUS_LABELS: Record<InviteStatus, string> = {
  [INVITE_STATUS.PENDING]: "Pending",
  [INVITE_STATUS.ACCEPTED]: "Accepted",
  [INVITE_STATUS.EXPIRED]: "Expired",
};

const STATUS_TONES: Record<InviteStatus, BadgeTone> = {
  [INVITE_STATUS.PENDING]: "info",
  [INVITE_STATUS.ACCEPTED]: "success",
  [INVITE_STATUS.EXPIRED]: "neutral",
};

export interface InviteStatusBadgeProps {
  status: InviteStatus;
}

/**
 * Coloured pill that mirrors the backend's three-state invite enum.
 * Lives in its own file so the InvitesList row can stay shape-only.
 */
export default function InviteStatusBadge({ status }: InviteStatusBadgeProps) {
  return <StatusBadge tone={STATUS_TONES[status]} label={STATUS_LABELS[status]} />;
}
