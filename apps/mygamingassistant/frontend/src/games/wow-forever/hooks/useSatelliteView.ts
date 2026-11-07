import { useCallback, useState } from "react";
import { MAP_STYLE } from "@/games/wow-forever/data/worldMap/mapStyle";
import { SATELLITE_MAPS } from "@/games/wow-forever/data/worldMap/satelliteMaps";
import { useMapStyle } from "@/games/wow-forever/hooks/useMapStyle";
import type { MapStyle } from "@/games/wow-forever/types/mapStyle/mapStyle";
import type { SatelliteView } from "@/games/wow-forever/types/mapStyle/satelliteView";
import { satelliteUrl } from "@/games/wow-forever/worldMap/mapStyle";

/**
 * One map's Map / Satellite state. The saved choice is the player's
 * preference; what shows is the satellite picture only when this map has one
 * and it loaded — until then (or if it fails) the drawn map stays on screen.
 * Mount once per map (MapCanvas is keyed by map id), so a failure never
 * carries over to the next map.
 */
export function useSatelliteView(mapId: number): SatelliteView {
  const [style, setStyle] = useMapStyle();
  const src = satelliteUrl(SATELLITE_MAPS, mapId);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const wanted = style === MAP_STYLE.satellite && src !== null && !failed;
  // The satellite <img> unmounts whenever it isn't wanted (Map picked here or
  // in another tab), so the next Satellite waits for a fresh load again.
  if (!wanted && loaded) setLoaded(false);

  const choose = useCallback(
    (next: MapStyle) => {
      // Picking Satellite again after a failure is the retry.
      if (next === MAP_STYLE.satellite) setFailed(false);
      setStyle(next);
    },
    [setStyle],
  );

  const preload = useCallback(() => {
    if (src && !loaded) new Image().src = src;
  }, [src, loaded]);

  const onLoad = useCallback(() => setLoaded(true), []);
  const onError = useCallback(() => {
    setLoaded(false);
    setFailed(true);
  }, []);

  return {
    available: src !== null,
    src: wanted ? src : null,
    shown: wanted && loaded,
    value: wanted ? MAP_STYLE.satellite : MAP_STYLE.drawn,
    busy: wanted && !loaded,
    failed: style === MAP_STYLE.satellite && src !== null && failed,
    choose,
    preload,
    onLoad,
    onError,
  };
}
