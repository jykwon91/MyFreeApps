import type { StatusTone } from "../types/status-tone";

/** The tone of each dimension status's badge: good, a caution, a problem, or just information. */
export const DIMENSION_STATUS_TONES: Record<string, StatusTone> = {
  strong: "success",
  partial: "warning",
  gap: "danger",
  aligned: "success",
  below: "warning",
  above: "info",
  above_target: "success",
  in_range: "success",
  below_target: "danger",
  not_disclosed: "neutral",
  no_target: "neutral",
  compatible: "success",
  stretch: "warning",
  incompatible: "danger",
  blocker: "danger",
  unclear: "neutral",
};
