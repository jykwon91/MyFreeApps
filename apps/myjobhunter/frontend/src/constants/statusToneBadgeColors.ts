import type { BadgeColor } from "@platform/ui/components/ui/Badge";
import type { StatusTone } from "@myjobhunter/api-client/types/status-tone";

/** Badge color per status tone. */
export const STATUS_TONE_BADGE_COLORS: Record<StatusTone, BadgeColor> = {
  neutral: "gray",
  info: "blue",
  accent: "purple",
  success: "green",
  warning: "yellow",
  danger: "red",
};
