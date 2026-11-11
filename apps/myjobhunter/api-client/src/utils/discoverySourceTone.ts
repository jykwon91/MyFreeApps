import { DISCOVERY_SOURCE_TONES } from "../constants/discoverySourceLabels";
import type { StatusTone } from "../types/status-tone";

/** The tone of an adapter's badge; neutral for any it doesn't single out. */
export function discoverySourceTone(source: string): StatusTone {
  return DISCOVERY_SOURCE_TONES[source] ?? "neutral";
}
