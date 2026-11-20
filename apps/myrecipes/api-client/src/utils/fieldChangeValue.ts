import { VERSION_COPY } from "../constants/versions";
import type { FieldChange } from "../types/recipe/field-change";
import { formatTotalMinutes } from "./formatTotalMinutes";

function minutesValue(minutes: number | null): string {
  if (minutes === null) return VERSION_COPY.emptyValue;
  return formatTotalMinutes(minutes) ?? `${minutes} min`;
}

/** One side of a field change as a cook reads it: "4", "1 hr 30 min", or "—" when it was empty. */
export function fieldChangeValue(change: FieldChange, side: "before" | "after"): string {
  if (change.field === "servings") return change[side] ?? VERSION_COPY.emptyValue;
  return minutesValue(change[side]);
}
