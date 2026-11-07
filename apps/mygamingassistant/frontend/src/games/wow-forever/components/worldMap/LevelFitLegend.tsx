import clsx from "clsx";
import {
  ZONE_FIT_HINT,
  ZONE_FIT_LABEL,
  ZONE_FIT_ORDER,
  ZONE_FIT_SWATCH,
  ZONE_FIT_SYMBOL,
} from "@/games/wow-forever/data/worldMap/levelFit";

interface LevelFitLegendProps {
  level: number;
  /** One line (under the map) instead of a list with hints (in the panel). */
  compact?: boolean;
}

/** What the zone tints mean for this level — colour, symbol and words, so it never relies on colour alone. */
export default function LevelFitLegend({ level, compact = false }: LevelFitLegendProps) {
  if (compact) {
    return (
      <p data-testid="level-fit-legend-compact" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-muted-foreground">Zones for level {level}:</span>
        {ZONE_FIT_ORDER.map((fit) => (
          <span key={fit} className="inline-flex items-center gap-1">
            <span aria-hidden className={clsx("inline-block h-3 w-3 rounded-sm", ZONE_FIT_SWATCH[fit])} />
            <span aria-hidden>{ZONE_FIT_SYMBOL[fit]}</span>
            {ZONE_FIT_LABEL[fit]}
          </span>
        ))}
      </p>
    );
  }
  return (
    <ul aria-label={`What the zone colours mean at level ${level}`} data-testid="level-fit-legend" className="space-y-1 text-xs">
      {ZONE_FIT_ORDER.map((fit) => (
        <li key={fit} className="flex items-start gap-2">
          <span aria-hidden className={clsx("mt-0.5 inline-block h-3 w-3 shrink-0 rounded-sm", ZONE_FIT_SWATCH[fit])} />
          <span>
            <span aria-hidden>{ZONE_FIT_SYMBOL[fit]} </span>
            <span className="font-medium">{ZONE_FIT_LABEL[fit]}</span>
            <span className="text-muted-foreground"> — {ZONE_FIT_HINT[fit]}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
