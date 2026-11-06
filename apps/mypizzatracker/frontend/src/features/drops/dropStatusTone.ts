import type { BadgeTone } from "@platform/ui";
import type { DropStatus } from "@/types/drop/drop";

export const STATUS_TONE: Record<DropStatus, BadgeTone> = {
  planning: "info",
  active: "success",
  closed: "neutral",
};
