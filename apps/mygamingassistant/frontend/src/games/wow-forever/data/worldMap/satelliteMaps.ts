import manifest from "@/games/wow-forever/data/worldMap/satellite.json";
import type { SatelliteManifest } from "@/games/wow-forever/types/mapStyle/satelliteManifest";

/** Which maps have a satellite view, and the client build their images come from. */
export const SATELLITE_MAPS: SatelliteManifest = {
  build: manifest.build,
  width: manifest.width,
  height: manifest.height,
  maps: manifest.maps,
};
