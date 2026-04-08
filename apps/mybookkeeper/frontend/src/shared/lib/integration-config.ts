import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { PlaidItem } from "@/shared/types/plaid/plaid-item";

export const PLAID_STATUS_BADGE: Record<PlaidItem["status"], { label: string; color: BadgeColor }> = {
  active: { label: "Connected", color: "green" },
  error: { label: "Error", color: "red" },
  expired: { label: "Expired", color: "yellow" },
};
