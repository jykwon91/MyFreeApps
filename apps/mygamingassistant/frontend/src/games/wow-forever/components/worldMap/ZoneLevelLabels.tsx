import { memo } from "react";
import clsx from "clsx";
import { ZONE_FIT_LABEL, ZONE_FIT_SYMBOL, ZONE_FIT_TEXT } from "@/games/wow-forever/data/worldMap/levelFit";
import type { ZoneFit } from "@/games/wow-forever/types/mapLayers/zoneFit";
import type { ZoneLabel } from "@/games/wow-forever/types/mapLayers/zoneLabel";

interface ZoneLevelLabelsProps {
  /** The labels that fit at this zoom (`placeZoneLabels`). */
  labels: readonly ZoneLabel[];
  /** Each zone's fit for the player, when the tint is on. */
  fits: ReadonlyMap<number, ZoneFit> | null;
}

const HALO = "[text-shadow:0_0_3px_rgb(0_0_0),0_0_2px_rgb(0_0_0),0_1px_2px_rgb(0_0_0)]";

/** Zone names and level ranges on a continent map, outlined to read on any art; they keep their size at any zoom. */
function ZoneLevelLabels({ labels, fits }: ZoneLevelLabelsProps) {
  return (
    <div aria-label="Zone levels" role="list" className="pointer-events-none absolute inset-0">
      {labels.map((label) => {
        const fit = fits?.get(label.zoneId);
        return (
          <div
            key={label.zoneId}
            role="listitem"
            data-testid="zone-label"
            data-zone={label.zoneId}
            data-fit={fit}
            className={clsx(
              "absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center text-[12px] font-semibold leading-tight text-white",
              HALO,
            )}
            style={{ left: `${label.x}%`, top: `${label.y}%` }}
          >
            <div>{label.name}</div>
            {label.detail && (
              <div className={clsx("text-[11px]", fit ? ZONE_FIT_TEXT[fit] : "text-amber-100")}>
                {fit && <span aria-hidden>{ZONE_FIT_SYMBOL[fit]} </span>}
                {label.detail}
                {fit && <span className="sr-only"> ({ZONE_FIT_LABEL[fit]})</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default memo(ZoneLevelLabels);
