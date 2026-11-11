import type { BadgeColor } from "@platform/ui/components/ui/Badge";
import { toneForVerdict } from "@myjobhunter/api-client/utils/toneForVerdict";
import { STATUS_TONE_BADGE_COLORS } from "@/constants/statusToneBadgeColors";

/** Badge colour for a card's verdict; blue when there is none or it's unknown. */
export function colorForVerdict(verdict: string | null): BadgeColor {
  return STATUS_TONE_BADGE_COLORS[toneForVerdict(verdict)];
}
