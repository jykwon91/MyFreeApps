import type { Leaflet } from "@/games/wow-forever/types/leaflet";

let loaded: Leaflet | null = null;
let pending: Promise<Leaflet> | null = null;

/** Leaflet if it has already loaded (the next map opens with no wait), else null. */
export function loadedLeaflet(): Leaflet | null {
  return loaded;
}

/** Loads Leaflet and its stylesheet once; a failed load can be tried again. */
export function loadLeaflet(): Promise<Leaflet> {
  pending ??= Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]).then(
    ([module]) => {
      loaded = module;
      return module;
    },
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}
