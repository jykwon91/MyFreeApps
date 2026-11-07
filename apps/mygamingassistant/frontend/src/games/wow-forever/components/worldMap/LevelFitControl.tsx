import LevelFitLegend from "@/games/wow-forever/components/worldMap/LevelFitLegend";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { levelCap, playerLevel } from "@/games/wow-forever/data/levelCap";
import { ZONE_LEVELS_PROVENANCE } from "@/games/wow-forever/data/worldMap/levelFit";
import type { MapView } from "@/games/wow-forever/types/worldMap";

interface LevelFitControlProps {
  /** The player's saved level (the You section's), shared both ways. */
  level: number | null;
  onLevelChange: (level: number | null) => void;
  enabled: boolean;
  onEnabledChange: (on: boolean) => void;
  /** Tints only show on a continent map. */
  continentView: boolean;
  /** The continent above the viewed zone, to jump to it; null on a continent or the world map. */
  continent: MapView | null;
  onOpen: (mapId: number) => void;
}

/** "Where to level": the player's level and the zone tint switch, with the legend and where the ranges come from. */
export default function LevelFitControl(props: LevelFitControlProps) {
  const { level, enabled, continentView, continent } = props;
  return (
    <section aria-labelledby="wm-level-fit" className="space-y-2 border-b pb-3">
      <h3 id="wm-level-fit" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        Where to level <ProvenanceBadge {...ZONE_LEVELS_PROVENANCE} />
      </h3>
      <label className="flex items-center gap-2 text-sm min-h-[44px] sm:min-h-[32px]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => props.onEnabledChange(e.target.checked)}
          className="h-4 w-4"
        />
        Tint zones by how well they fit my level
      </label>
      <NumberField
        label="Your level"
        value={level}
        min={1}
        max={levelCap()}
        onChange={(value) => props.onLevelChange(playerLevel(value))}
      />
      {enabled && level === null && <p className="text-xs text-muted-foreground">Enter your level to tint the zones.</p>}
      {enabled && level !== null && <LevelFitLegend level={level} />}
      {enabled && level !== null && !continentView && (
        <p className="text-xs text-muted-foreground">
          The tints show on a continent map.{" "}
          {continent && (
            <button type="button" onClick={() => props.onOpen(continent.id)} className="underline min-h-[44px] sm:min-h-[32px]">
              Open {continent.name}
            </button>
          )}
        </p>
      )}
    </section>
  );
}
