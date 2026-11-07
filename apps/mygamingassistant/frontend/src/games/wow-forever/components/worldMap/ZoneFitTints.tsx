import { memo, type CSSProperties } from "react";
import clsx from "clsx";
import { ZONE_FIT_TINT } from "@/games/wow-forever/data/worldMap/levelFit";
import type { MapView, WorldMapData } from "@/games/wow-forever/types/worldMap";
import { childrenOf } from "@/games/wow-forever/worldMap/mapHitTest";
import { projectRect } from "@/games/wow-forever/worldMap/mapGeometry";
import type { ZoneFit } from "@/games/wow-forever/types/mapLayers/zoneFit";

interface ZoneFitTintsProps {
  data: WorldMapData;
  /** A continent map. */
  map: MapView;
  /** Each zone's fit (`zoneFitsOf`); zones missing from it stay untinted. */
  fits: ReadonlyMap<number, ZoneFit>;
}

/**
 * Each zone of the continent washed with how it fits your level, through the
 * client's own highlight art (the shape the game lights up on hover). Zones
 * with no level range (new in Forever, cities) stay untinted.
 */
function ZoneFitTints({ data, map, fits }: ZoneFitTintsProps) {
  return (
    <>
      {childrenOf(data, map.id).map((child) => {
        const zone = child.zone;
        const fit = fits.get(child.id);
        const rect = zone && projectRect(map, zone);
        if (!zone || !fit || !rect) return null;
        const box: CSSProperties = { left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` };
        const art = `url(/wow-maps/highlight/${child.id}.webp)`;
        const style: CSSProperties = zone.highlight
          ? {
              ...box,
              maskImage: art,
              WebkitMaskImage: art,
              maskSize: "100% 100%",
              WebkitMaskSize: "100% 100%",
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
            }
          : box;
        return (
          <div
            key={child.id}
            aria-hidden
            data-testid="zone-fit-tint"
            data-zone={child.id}
            data-fit={fit}
            className={clsx("pointer-events-none absolute opacity-45", ZONE_FIT_TINT[fit], !zone.highlight && "rounded-sm")}
            style={style}
          />
        );
      })}
    </>
  );
}

export default memo(ZoneFitTints);
