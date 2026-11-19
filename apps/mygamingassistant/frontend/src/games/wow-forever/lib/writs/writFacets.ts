import { WRIT_LOCATION_UNKNOWN } from "@/games/wow-forever/data/professions/writs/writParams";
import { WRIT_NO_TURN_IN } from "@/games/wow-forever/data/professions/writs/writsCopy";
import { WRIT_TIERS } from "@/games/wow-forever/data/professions/writs/writTiers";
import { countByTier } from "@/games/wow-forever/lib/professionTiers/countByTier";
import { filterWritRows, writLocationOf } from "@/games/wow-forever/lib/writs/filterWritRows";
import type { TierCounts } from "@/games/wow-forever/types/professionTiers/tierCounts";
import type { WritFilters } from "@/games/wow-forever/types/writs/writFilters";
import type { WritLocationOption } from "@/games/wow-forever/types/writs/writLocationOption";
import type { WritRow } from "@/games/wow-forever/types/writs/writRow";
import type { WritTier } from "@/games/wow-forever/types/writs/writTier";
import type { WritsFile } from "@/games/wow-forever/types/writs/writsFile";

/** How many writs each tier would show with the other filters applied (the tier filter itself ignored). */
export function tierCounts(rows: readonly WritRow[], filters: WritFilters): TierCounts<WritTier> {
  return countByTier(filterWritRows(rows, { ...filters, tier: null }), WRIT_TIERS, (row) => row.writ.tier);
}

/** Every recorded zone (A-Z), then "Not known yet", each with how many writs it would show for this house; the location filter itself is ignored. */
export function locationOptions(rows: readonly WritRow[], filters: WritFilters, locations: readonly string[]): WritLocationOption[] {
  const counts = new Map<string, number>();
  for (const row of filterWritRows(rows, { ...filters, location: null })) {
    const location = writLocationOf(row);
    counts.set(location, (counts.get(location) ?? 0) + 1);
  }
  const zones = locations.filter((l) => l !== WRIT_LOCATION_UNKNOWN);
  const options = zones.map((zone) => ({ value: zone, label: zone, count: counts.get(zone) ?? 0 }));
  return [...options, { value: WRIT_LOCATION_UNKNOWN, label: WRIT_NO_TURN_IN, count: counts.get(WRIT_LOCATION_UNKNOWN) ?? 0 }];
}

/** Every zone any writ was handed in at, for any faction (A-Z), plus "unknown": the values a link's `?loc=` may name.
 * Not per house, so switching house never drops a `?loc=` from the link. */
export function knownLocations(turnIns: WritsFile["turnIns"]): string[] {
  const zones = new Set(Object.values(turnIns).flatMap((spots) => spots.map((s) => s.zone)));
  return [...[...zones].sort((a, b) => a.localeCompare(b)), WRIT_LOCATION_UNKNOWN];
}
