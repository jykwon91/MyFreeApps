import { yardsBetween, zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import { ZONE_CENTRE } from "@/games/wow-forever/worldMap/worldMapModel";
import type { VendorSpot } from "@/games/wow-forever/types/recipeSources";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";
import type { WorldPoint, WorldZone } from "@/games/wow-forever/types/worldMap";

/** Where you stand in the world: your saved spot in your zone, or its middle. Null when no zone is set (or it isn't on the map). */
export function playerPoint(
  zoneById: ReadonlyMap<number, WorldZone>,
  zoneId: number | null,
  position: { x: number; y: number } | null,
): WorldPoint | null {
  const zone = zoneId === null ? undefined : zoneById.get(zoneId);
  if (!zone) return null;
  const spot = position ?? ZONE_CENTRE;
  return zoneToWorld(zone, spot.x, spot.y);
}

/** Straight-line yards from you to a vendor; Infinity on another continent; null when either end can't be placed. */
export function vendorYards(vendor: Pick<VendorSpot, "zoneId" | "x" | "y">, place: VendorPlace): number | null {
  const zone = place.zoneById.get(vendor.zoneId);
  if (!place.here || !zone) return null;
  return yardsBetween(place.here, zoneToWorld(zone, vendor.x, vendor.y));
}
