import { useCallback, useState } from "react";
import { SERVICE_KIND } from "@/games/wow-forever/data/worldMap/serviceKinds";
import type { MapLayerChoice } from "@/games/wow-forever/worldMap/mapLayers";

/**
 * What the player is looking for on the World Map — the "finding" filters.
 * Deliberately NOT the "You" section (faction / class / zone / level /
 * position): that is who the player is, remembered per viewer, and a
 * filter reset must never forget it.
 */
export interface FindFilters {
  findFilterId: string;
  showAllClasses: boolean;
  includeOtherFaction: boolean;
  layers: MapLayerChoice;
}

export const DEFAULT_FIND_FILTERS: FindFilters = {
  findFilterId: SERVICE_KIND.classTrainer,
  showAllClasses: false,
  includeOtherFaction: false,
  layers: { questGivers: false, instances: true },
};

export function isDefaultFindFilters(f: FindFilters): boolean {
  const d = DEFAULT_FIND_FILTERS;
  return (
    f.findFilterId === d.findFilterId &&
    f.showAllClasses === d.showAllClasses &&
    f.includeOtherFaction === d.includeOtherFaction &&
    f.layers.questGivers === d.layers.questGivers &&
    f.layers.instances === d.layers.instances
  );
}

export interface FindFiltersState {
  filters: FindFilters;
  update: (patch: Partial<FindFilters>) => void;
  reset: () => void;
  atDefaults: boolean;
}

export function useFindFilters(): FindFiltersState {
  const [filters, setFilters] = useState<FindFilters>(DEFAULT_FIND_FILTERS);
  const update = useCallback((patch: Partial<FindFilters>) => setFilters((f) => ({ ...f, ...patch })), []);
  const reset = useCallback(() => setFilters(DEFAULT_FIND_FILTERS), []);
  return { filters, update, reset, atDefaults: isDefaultFindFilters(filters) };
}
