import { DIFF_CHANGE_DISPLAY, VERSION_COPY } from "@myrecipes/api-client/constants/versions";
import type { DiffLine } from "../types/DiffLine";

/** A change as a screen reader says it: "Changed: 1 tsp salt to 2 tsp salt". */
export function diffLineLabel(line: DiffLine): string {
  const { label } = DIFF_CHANGE_DISPLAY[line.change];
  if (line.change === "changed") return `${label}: ${line.before ?? ""} ${VERSION_COPY.to} ${line.after ?? ""}`;
  return `${label}: ${(line.change === "removed" ? line.before : line.after) ?? ""}`;
}
