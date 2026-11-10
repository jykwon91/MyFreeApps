import type { DimensionTone } from "@/types/job-analysis/dimension-tone";

/** Badge colour per dimension status; unknown statuses fall back to gray. */
export const DIMENSION_STATUS_TONES: Record<string, DimensionTone> = {
  strong: "green",
  partial: "yellow",
  gap: "red",
  aligned: "green",
  below: "yellow",
  above: "blue",
  above_target: "green",
  in_range: "green",
  below_target: "red",
  not_disclosed: "gray",
  no_target: "gray",
  compatible: "green",
  stretch: "yellow",
  incompatible: "red",
  blocker: "red",
  unclear: "gray",
};
