import { localToday } from "@platform/core/utils/localToday";

/**
 * The moment sent as `applied_at` for the day the person says they applied ("YYYY-MM-DD", local).
 * Today is now, so the applications added today keep the order they were added in. An earlier
 * day is its local midnight, so any event logged on that day, at any time, is later than the
 * application's "applied" event and decides its stage.
 */
export function appliedAtFromLocalDate(appliedOn: string): string {
  if (appliedOn === localToday()) return new Date().toISOString();
  const [year, month, day] = appliedOn.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1).toISOString();
}
