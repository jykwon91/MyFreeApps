import type { BadgeTone } from "@platform/ui";
import type { DropHealth } from "@/types/financials/financials";

export const HEALTH_LABELS: Record<DropHealth, string> = {
  green: "Healthy",
  amber: "Marginal",
  red: "Underwater",
};

export const HEALTH_TONES: Record<DropHealth, BadgeTone> = {
  green: "success",
  amber: "warning",
  red: "danger",
};
