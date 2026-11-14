import { formatTag } from "@platform/core/utils/tag";

/** How a transaction's Schedule E line reads, e.g. "line_5_advertising" as "Line 5 Advertising". */
export function scheduleELineLabel(line: string): string {
  return formatTag(line);
}
