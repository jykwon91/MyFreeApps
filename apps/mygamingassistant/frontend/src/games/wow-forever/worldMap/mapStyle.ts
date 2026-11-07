import { MAP_STYLE, SATELLITE_BASE } from "@/games/wow-forever/data/worldMap/mapStyle";
import type { MapStyle } from "@/games/wow-forever/types/mapStyle/mapStyle";
import type { SatelliteManifest } from "@/games/wow-forever/types/mapStyle/satelliteManifest";

/** A stored Map / Satellite choice, or null when it isn't one. */
export function parseMapStyle(raw: unknown): MapStyle | null {
  return raw === MAP_STYLE.drawn || raw === MAP_STYLE.satellite ? raw : null;
}

/**
 * The satellite picture's URL for a map, or null when it has none — the world,
 * the continents, dungeon interiors and the underground capitals (Ironforge,
 * Undercity) stay drawn-only.
 */
export function satelliteUrl(manifest: SatelliteManifest, mapId: number): string | null {
  if (!manifest.maps.includes(mapId)) return null;
  return `${SATELLITE_BASE}/${manifest.build}/${mapId}.webp`;
}
