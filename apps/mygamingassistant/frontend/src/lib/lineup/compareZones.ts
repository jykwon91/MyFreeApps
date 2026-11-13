import { ZONE_ORDER_PREFIXES } from "@/constants/lineupOrdering";

function zoneOrder(zoneName: string): number {
  const lower = zoneName.toLowerCase();
  const idx = ZONE_ORDER_PREFIXES.findIndex((prefix) => lower.startsWith(prefix));
  return idx === -1 ? ZONE_ORDER_PREFIXES.length : idx;
}

/** A Site → B Site → Mid → everything else alphabetically. */
export function compareZones(a: string, b: string): number {
  const orderDiff = zoneOrder(a) - zoneOrder(b);
  if (orderDiff !== 0) return orderDiff;
  return a.localeCompare(b);
}
