import clsx from "clsx";
import type { MapView, PlayerFaction } from "@/games/wow-forever/types/worldMap";
import { HIT_KIND, isZoneView, type MapHit } from "@/games/wow-forever/worldMap/mapHitTest";
import { RELATION_TEXT, zoneFacts, zoneRelation } from "@/games/wow-forever/worldMap/mapTerritory";

interface MapHoverStatusProps {
  map: MapView;
  hover: MapHit | null;
  faction: PlayerFaction;
}

/** The line under the map: what the pointer is over and what a click does — the in-game zone tooltip. */
export default function MapHoverStatus({ map, hover, faction }: MapHoverStatusProps) {
  const target = hover?.target;
  if (hover?.kind === HIT_KIND.goTo && target) {
    const facts = zoneFacts(target);
    return (
      <p className="min-h-[1.5rem] text-sm">
        <span className={clsx("font-semibold", RELATION_TEXT[zoneRelation(target, faction)])}>{target.name}</span>
        {facts && <span className="text-muted-foreground"> · {facts}</span>}
        <span className="text-muted-foreground"> — click to go there</span>
      </p>
    );
  }
  if (hover?.kind === HIT_KIND.here) {
    return (
      <p className="min-h-[1.5rem] text-sm text-muted-foreground">
        {map.name} — click to set your position here
      </p>
    );
  }
  const facts = zoneFacts(map);
  return (
    <p className="min-h-[1.5rem] text-sm text-muted-foreground">
      <span className={clsx("font-semibold", RELATION_TEXT[zoneRelation(map, faction)])}>{map.name}</span>
      {facts && ` · ${facts}`}
      {!isZoneView(map) && " — hover a zone to see it, click to open it"}
    </p>
  );
}
