import { DISCOVERY_SOURCE_LABELS } from "../constants/discoverySourceLabels";

/** An adapter's display name, or its raw key when this build doesn't know it. */
export function discoverySourceLabel(source: string): string {
  return DISCOVERY_SOURCE_LABELS[source] ?? source;
}
