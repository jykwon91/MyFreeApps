import type { CSSProperties } from "react";
import clsx from "clsx";
import type { MapView, PlayerFaction } from "@/games/wow-forever/types/worldMap";
import { projectRect } from "@/games/wow-forever/worldMap/mapGeometry";
import { RELATION_OUTLINE, RELATION_TINT, zoneRelation } from "@/games/wow-forever/worldMap/mapTerritory";

interface MapHoverHighlightProps {
  /** The map being looked at. */
  map: MapView;
  /** The map under the pointer — the one a click would open. */
  target: MapView;
  faction: PlayerFaction;
}

/**
 * The hovered zone lit up the way the game does it: the client's highlight
 * art (white glow, as a CSS mask) tinted friendly / hostile / contested for
 * this player, stretched over the zone's map rectangle. Cities and islands
 * ship no highlight art — they get a tinted outline of their rectangle.
 */
export default function MapHoverHighlight({ map, target, faction }: MapHoverHighlightProps) {
  const rect = target.zone && projectRect(map, target.zone);
  if (!rect) return null;
  const relation = zoneRelation(target, faction);
  const box: CSSProperties = {
    left: `${rect.left}%`,
    top: `${rect.top}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
  };
  if (!target.zone?.highlight) {
    return (
      <div
        aria-hidden
        className={clsx("pointer-events-none absolute rounded-sm border-2", RELATION_OUTLINE[relation])}
        style={box}
      />
    );
  }
  const art = `url(/wow-maps/highlight/${target.id}.webp)`;
  return (
    <div
      aria-hidden
      data-testid="map-hover-highlight"
      className={clsx("pointer-events-none absolute opacity-80 mix-blend-screen", RELATION_TINT[relation])}
      style={{
        ...box,
        maskImage: art,
        WebkitMaskImage: art,
        maskSize: "100% 100%",
        WebkitMaskSize: "100% 100%",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
      }}
    />
  );
}
