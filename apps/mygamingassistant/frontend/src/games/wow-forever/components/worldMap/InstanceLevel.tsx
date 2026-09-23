import clsx from "clsx";
import type { MapPoi } from "@/games/wow-forever/types/worldMap";
import {
  instanceBand,
  instanceLevelText,
  LEVEL_BAND_LABEL,
  LEVEL_BAND_TEXT_CLASS,
} from "@/games/wow-forever/worldMap/levels";

interface InstanceLevelProps {
  poi: MapPoi;
  level: number | null;
}

/** "Level 17 (Forever) · opens at level 10 — your level", coloured for the player. */
export default function InstanceLevel({ poi, level }: InstanceLevelProps) {
  const band = level === null ? null : instanceBand(poi, level);
  const locked = level !== null && level < (poi.requiredLevel ?? 0);
  return (
    <p className={clsx("text-sm", band && LEVEL_BAND_TEXT_CLASS[band])}>
      {instanceLevelText(poi)} in Forever
      {poi.requiredLevel ? ` · opens at level ${poi.requiredLevel}` : ""}
      {locked && " — too low to enter yet"}
      {band && !locked && ` — ${LEVEL_BAND_LABEL[band]}`}
    </p>
  );
}
