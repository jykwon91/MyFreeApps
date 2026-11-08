import { useEffect, useMemo, useState } from "react";
import { loadZoneById } from "@/games/wow-forever/gathering/loadZoneById";
import { playerPoint } from "@/games/wow-forever/lib/recipeVendors/vendorDistance";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";
import type { PlayerFaction, WorldZone } from "@/games/wow-forever/types/worldMap";

const NO_ZONES: ReadonlyMap<number, WorldZone> = new Map();

/**
 * Who's buying and where they stand, to sort recipe vendors nearest first.
 * The zone table loads in the background; until then (or if it fails)
 * vendors simply sort without distances.
 */
export function useVendorPlace(faction: PlayerFaction, zoneId: number | null, position: { x: number; y: number } | null): VendorPlace {
  const [zoneById, setZoneById] = useState<ReadonlyMap<number, WorldZone>>(NO_ZONES);
  useEffect(() => {
    let live = true;
    loadZoneById()
      .then((zones) => {
        if (live) setZoneById(zones);
      })
      // Distances are a nicety: without the zone table the list still shows, sorted by faction and name.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const x = position?.x ?? null;
  const y = position?.y ?? null;
  return useMemo(() => {
    const spot = x === null || y === null ? null : { x, y };
    return { faction, here: playerPoint(zoneById, zoneId, spot), zoneById };
  }, [faction, zoneById, zoneId, x, y]);
}
