import type { CharacterCounters } from "../types/character-counters";
import type { FieldLimits } from "../types/field-limits";
import { characterCounter } from "@platform/core/utils/characterCounter";

/** The counters of the fields over or near their limit, counted on what is sent (trimmed). */
export function countersFor<Values extends object>(
  values: Values,
  limits: FieldLimits<Values>,
): CharacterCounters<Extract<keyof Values, string>> {
  const counters: CharacterCounters<Extract<keyof Values, string>> = {};
  for (const field of Object.keys(limits) as Extract<keyof Values, string>[]) {
    const limit = limits[field];
    const value = values[field];
    if (limit === undefined || typeof value !== "string") continue;
    const counter = characterCounter(value.trim(), limit);
    if (counter) counters[field] = counter;
  }
  return counters;
}
