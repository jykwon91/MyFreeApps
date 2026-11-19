import { WRIT_LOCATION_UNKNOWN } from "@/games/wow-forever/data/professions/writs/writParams";
import { WRIT_NO_TURN_IN } from "@/games/wow-forever/data/professions/writs/writsCopy";
import { filterWritRows, writLocationOf } from "@/games/wow-forever/lib/writs/filterWritRows";
import type { WritFilters } from "@/games/wow-forever/types/writs/writFilters";
import type { WritLocationOption } from "@/games/wow-forever/types/writs/writLocationOption";
import type { WritRow } from "@/games/wow-forever/types/writs/writRow";
import type { WritTier } from "@/games/wow-forever/types/writs/writTier";

/** How many writs each tier would show with the other filters applied (the tier filter itself ignored). */
export function tierCounts(rows: readonly WritRow[], filters: WritFilters): Record<WritTier, number> & { all: number } {
  const others = filterWritRows(rows, { ...filters, tier: null });
  const counts = { all: others.length, journeyman: 0, expert: 0, artisan: 0 };
  for (const row of others) counts[row.writ.tier] += 1;
  return counts;
}

/** Every recorded zone (A-Z), then "Not known yet", each with how many writs it would show; the location filter itself is ignored. */
export function locationOptions(rows: readonly WritRow[], filters: WritFilters): WritLocationOption[] {
  const counts = new Map<string, number>();
  for (const row of filterWritRows(rows, { ...filters, location: null })) {
    const location = writLocationOf(row);
    counts.set(location, (counts.get(location) ?? 0) + 1);
  }
  const zones = knownLocations(rows).filter((l) => l !== WRIT_LOCATION_UNKNOWN);
  const options = zones.map((zone) => ({ value: zone, label: zone, count: counts.get(zone) ?? 0 }));
  return [...options, { value: WRIT_LOCATION_UNKNOWN, label: WRIT_NO_TURN_IN, count: counts.get(WRIT_LOCATION_UNKNOWN) ?? 0 }];
}

/** Every zone a writ was handed in at (A-Z) plus "unknown": the values a link's `?loc=` may name. */
export function knownLocations(rows: readonly WritRow[]): string[] {
  const zones = new Set(rows.map((r) => r.turnIn?.zone).filter((z): z is string => z !== undefined));
  return [...[...zones].sort((a, b) => a.localeCompare(b)), WRIT_LOCATION_UNKNOWN];
}
