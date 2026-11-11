import type { StatusTone } from "../types/status-tone";

/** Human-readable name of each source adapter. */
export const DISCOVERY_SOURCE_LABELS: Record<string, string> = {
  jsearch: "JSearch",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  remoteok: "RemoteOK",
  hn_who_is_hiring: "HN: Who's Hiring",
  workatastartup: "Work at a Startup",
  other: "Other",
};

/** Greenhouse and Lever are toned apart so official feeds stand out from the aggregator. */
export const DISCOVERY_SOURCE_TONES: Record<string, StatusTone> = {
  jsearch: "neutral",
  greenhouse: "success",
  lever: "info",
};
